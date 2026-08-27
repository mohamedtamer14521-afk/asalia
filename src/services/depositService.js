const db = require('../database/db');
const storage = require('../storage');

class DepositService {
  /**
   * Submit a new deposit request by a customer
   */
  async submitDeposit({ userId, paymentMethodId, amount, senderNumber, transactionReference, file }) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw { code: 'INVALID_AMOUNT', message: 'Deposit amount must be greater than zero.' };
    }

    if (!senderNumber || !senderNumber.trim()) {
      throw { code: 'MISSING_SENDER_NUMBER', message: 'Sender phone or account number is required.' };
    }

    if (!file || !file.buffer) {
      throw { code: 'MISSING_SCREENSHOT', message: 'Payment screenshot proof is required.' };
    }

    // 1. Verify Payment Method exists & active
    const methodRes = await db.query(
      'SELECT id, name_en, name_ar, min_deposit, max_deposit, is_active FROM payment_methods WHERE id = $1',
      [paymentMethodId]
    );

    if (methodRes.rows.length === 0) {
      throw { code: 'METHOD_NOT_FOUND', message: 'Selected payment method does not exist.' };
    }

    const method = methodRes.rows[0];

    if (!method.is_active) {
      throw { code: 'METHOD_INACTIVE', message: 'This payment method is currently disabled.' };
    }

    if (parsedAmount < parseFloat(method.min_deposit)) {
      throw {
        code: 'AMOUNT_BELOW_MINIMUM',
        message: `Amount is below the minimum required deposit of ${Number(method.min_deposit).toFixed(2)} EGP.`
      };
    }

    if (parsedAmount > parseFloat(method.max_deposit)) {
      throw {
        code: 'AMOUNT_EXCEEDS_MAXIMUM',
        message: `Amount exceeds the maximum allowed deposit of ${Number(method.max_deposit).toFixed(2)} EGP.`
      };
    }

    // 2. Upload file via persistent StorageManager abstraction
    const savedStorage = await storage.saveFile(file);

    // 3. Insert deposit into PostgreSQL with status = 'PENDING'
    const insertRes = await db.query(
      `INSERT INTO deposits (
        user_id,
        payment_method_id,
        payment_method_name_snap,
        amount,
        sender_number,
        transaction_reference,
        screenshot_storage_key,
        screenshot_file_type,
        screenshot_size,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
      RETURNING *`,
      [
        userId,
        method.id,
        method.name_en,
        parsedAmount,
        senderNumber.trim(),
        (transactionReference || '').trim(),
        savedStorage.key,
        savedStorage.fileType,
        savedStorage.size
      ]
    );

    const deposit = insertRes.rows[0];

    // 4. Create in-app notification for customer
    await db.query(
      `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type, link)
       VALUES ($1, $2, $3, $4, $5, 'deposit', $6)`,
      [
        userId,
        `Deposit #${deposit.id} Pending Review`,
        `طلب الإيداع #${deposit.id} قيد المراجعة`,
        `Your deposit of ${parsedAmount.toFixed(2)} EGP has been submitted and is awaiting admin approval.`,
        `تم استلام طلب الإيداع بمبلغ ${parsedAmount.toFixed(2)} ج.م وهو قيد مراجعة واعتماد الإدارة.`,
        `/dashboard?tab=transactions`
      ]
    );

    return deposit;
  }

  /**
   * Admin approves a deposit within an ACID transaction:
   * 1. Checks status == 'PENDING'
   * 2. Locks user balance
   * 3. Credits user balance
   * 4. Creates ledger transaction (type: 'DEPOSIT')
   * 5. Updates deposit status to 'APPROVED'
   * 6. Prevents duplicate approvals
   */
  async approveDeposit(depositId, adminId, adminNotes = 'Approved by admin') {
    return await db.transaction(async (tx) => {
      // Lock deposit row to prevent race conditions or duplicate approvals
      const depRes = await tx.query(
        'SELECT * FROM deposits WHERE id = $1 FOR UPDATE',
        [depositId]
      );

      if (depRes.rows.length === 0) {
        throw { code: 'DEPOSIT_NOT_FOUND', message: 'Deposit request not found.' };
      }

      const deposit = depRes.rows[0];

      if (deposit.status !== 'PENDING') {
        throw {
          code: 'INVALID_DEPOSIT_STATE',
          message: `Cannot approve deposit. Current status is already ${deposit.status}.`
        };
      }

      const creditAmount = parseFloat(deposit.amount);

      // Lock user balance
      const userRes = await tx.query(
        'SELECT id, username, balance FROM users WHERE id = $1 FOR UPDATE',
        [deposit.user_id]
      );

      if (userRes.rows.length === 0) {
        throw { code: 'USER_NOT_FOUND', message: 'Customer account not found.' };
      }

      const user = userRes.rows[0];
      const currentBalance = parseFloat(user.balance);
      const newBalance = parseFloat((currentBalance + creditAmount).toFixed(4));

      // Credit user wallet
      await tx.query(
        'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newBalance, user.id]
      );

      // Record in immutable wallet ledger
      await tx.query(
        `INSERT INTO wallet_transactions (
          user_id, type, amount, balance_before, balance_after, description, reference_id
        ) VALUES ($1, 'DEPOSIT', $2, $3, $4, $5, $6)`,
        [
          user.id,
          creditAmount,
          currentBalance,
          newBalance,
          `Deposit #${deposit.id} via ${deposit.payment_method_name_snap}`,
          String(deposit.id)
        ]
      );

      // Update deposit status to APPROVED
      await tx.query(
        `UPDATE deposits 
         SET status = 'APPROVED', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 
         WHERE id = $3`,
        [adminNotes, adminId, deposit.id]
      );

      // Notify customer
      await tx.query(
        `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type)
         VALUES ($1, $2, $3, $4, $5, 'deposit_approved')`,
        [
          user.id,
          `Deposit #${deposit.id} Approved!`,
          `تمت الموافقة على الإيداع #${deposit.id}!`,
          `Your deposit of ${creditAmount.toFixed(2)} EGP has been approved. Balance added to your wallet.`,
          `تمت الموافقة على إيداعك بمبلغ ${creditAmount.toFixed(2)} ج.م وتمت إضافته لرصيد محفظتك.`
        ]
      );

      // Record in Admin Audit Log
      await tx.query(
        `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_state, after_state)
         VALUES ($1, 'DEPOSIT_APPROVE', 'DEPOSIT', $2, $3, $4)`,
        [
          adminId,
          String(deposit.id),
          JSON.stringify({ status: 'PENDING', amount: creditAmount }),
          JSON.stringify({ status: 'APPROVED', newBalance })
        ]
      );

      return {
        depositId: deposit.id,
        userId: user.id,
        amount: creditAmount,
        newBalance
      };
    });
  }

  /**
   * Admin rejects a deposit request
   */
  async rejectDeposit(depositId, adminId, adminNotes = 'Rejected by admin') {
    return await db.transaction(async (tx) => {
      const depRes = await tx.query(
        'SELECT * FROM deposits WHERE id = $1 FOR UPDATE',
        [depositId]
      );

      if (depRes.rows.length === 0) {
        throw { code: 'DEPOSIT_NOT_FOUND', message: 'Deposit request not found.' };
      }

      const deposit = depRes.rows[0];

      if (deposit.status !== 'PENDING') {
        throw {
          code: 'INVALID_DEPOSIT_STATE',
          message: `Cannot reject deposit. Current status is already ${deposit.status}.`
        };
      }

      // Update deposit status to REJECTED
      await tx.query(
        `UPDATE deposits 
         SET status = 'REJECTED', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 
         WHERE id = $3`,
        [adminNotes, adminId, deposit.id]
      );

      // Notify customer
      await tx.query(
        `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type)
         VALUES ($1, $2, $3, $4, $5, 'deposit_rejected')`,
        [
          deposit.user_id,
          `Deposit #${deposit.id} Rejected`,
          `تم رفض طلب الإيداع #${deposit.id}`,
          `Your deposit #${deposit.id} was rejected. Reason: ${adminNotes}`,
          `تم رفض طلب الإيداع #${deposit.id}. السبب: ${adminNotes}`
        ]
      );

      // Record in Admin Audit Log
      await tx.query(
        `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_state, after_state)
         VALUES ($1, 'DEPOSIT_REJECT', 'DEPOSIT', $2, $3, $4)`,
        [
          adminId,
          String(deposit.id),
          JSON.stringify({ status: 'PENDING' }),
          JSON.stringify({ status: 'REJECTED', reason: adminNotes })
        ]
      );

      return {
        depositId: deposit.id,
        status: 'REJECTED'
      };
    });
  }

  /**
   * Delete a deposit request permanently (Admin only)
   */
  async deleteDeposit(depositId, adminId) {
    return await db.transaction(async (tx) => {
      const depRes = await tx.query('SELECT * FROM deposits WHERE id = $1', [depositId]);
      if (depRes.rows.length === 0) {
        throw { code: 'DEPOSIT_NOT_FOUND', message: 'Deposit request not found.' };
      }
      const deposit = depRes.rows[0];

      // Delete the deposit record
      await tx.query('DELETE FROM deposits WHERE id = $1', [depositId]);

      // Record in Admin Audit Log
      await tx.query(
        `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_state, after_state)
         VALUES ($1, 'DEPOSIT_DELETE', 'DEPOSIT', $2, $3, $4)`,
        [
          adminId,
          String(deposit.id),
          JSON.stringify({ status: deposit.status, amount: deposit.amount, user_id: deposit.user_id }),
          JSON.stringify({ deleted: true })
        ]
      );

      return {
        depositId: deposit.id,
        deleted: true
      };
    });
  }
}

module.exports = new DepositService();
