const db = require('../database/db');
const { validateTargetLink } = require('../utils/validation');

class OrderService {
  /**
   * Create a single order with strict ACID financial transaction
   * @param {Object} params
   * @param {number} params.userId
   * @param {number} params.serviceId
   * @param {string} params.targetLink
   * @param {number} params.quantity
   * @param {string} [params.username]
   * @param {string} [params.idempotencyKey]
   */
  async createOrder({ userId, serviceId, targetLink, quantity, username = '', idempotencyKey = null }) {
    // 1. Basic validation
    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      throw { code: 'INVALID_QUANTITY', message: 'Order quantity must be a positive integer.' };
    }

    if (!targetLink || typeof targetLink !== 'string' || !targetLink.trim()) {
      throw { code: 'INVALID_LINK', message: 'Target link is required.' };
    }

    const cleanLink = targetLink.trim();

    // 2. Fetch service definition and verify active
    const serviceRes = await db.query(
      `SELECT s.*, c.name_en AS category_name_en, c.name_ar AS category_name_ar
       FROM services s
       LEFT JOIN service_categories c ON s.category_id = c.id
       WHERE s.id = $1`,
      [serviceId]
    );

    if (serviceRes.rows.length === 0) {
      throw { code: 'SERVICE_NOT_FOUND', message: 'The selected service does not exist.' };
    }

    const service = serviceRes.rows[0];

    if (!service.is_active) {
      throw { code: 'SERVICE_INACTIVE', message: 'This service is currently disabled.' };
    }

    // 3. Verify quantity limits
    if (parsedQty < service.min_quantity) {
      throw {
        code: 'QUANTITY_TOO_LOW',
        message: `Quantity (${parsedQty}) is below the minimum required limit of ${service.min_quantity}.`
      };
    }

    if (parsedQty > service.max_quantity) {
      throw {
        code: 'QUANTITY_TOO_HIGH',
        message: `Quantity (${parsedQty}) exceeds the maximum allowed limit of ${service.max_quantity}.`
      };
    }

    // 4. Validate link against service link_type rules
    const linkValidation = validateTargetLink(cleanLink, service.link_type);
    if (!linkValidation.isValid) {
      throw { code: 'INVALID_LINK_FORMAT', message: linkValidation.message };
    }

    // 5. Backend strictly recalculates authoritative charge in EGP
    // Formula: (quantity / 1000) * price_per_1000
    const pricePer1000 = Number(service.price_per_1000);
    const calculatedCharge = (parsedQty / 1000) * pricePer1000;
    // Format to 4 decimal places for NUMERIC precision
    const finalCharge = parseFloat(calculatedCharge.toFixed(4));

    // 6. Check Duplicate Order Protection / 10-second backend safety window
    const recentDupRes = await db.query(
      `SELECT id FROM orders 
       WHERE user_id = $1 
         AND service_id = $2 
         AND target_link = $3 
         AND quantity = $4 
         AND created_at > (NOW() - INTERVAL '10 seconds')
       LIMIT 1`,
      [userId, serviceId, cleanLink, parsedQty]
    );

    if (recentDupRes.rows.length > 0) {
      throw {
        code: 'DUPLICATE_ORDER_PREVENTED',
        message: 'A duplicate order with identical parameters was recently placed. Please wait 10 seconds before resubmitting.'
      };
    }

    // If explicit idempotency key provided, check for previous execution
    if (idempotencyKey) {
      const idempRes = await db.query(
        'SELECT id, status, charge FROM orders WHERE idempotency_key = $1 AND user_id = $2',
        [idempotencyKey, userId]
      );
      if (idempRes.rows.length > 0) {
        return {
          order: idempRes.rows[0],
          isIdempotentReplay: true
        };
      }
    }

    // 7. Execute within ONE ATOMIC DATABASE TRANSACTION
    return await db.transaction(async (tx) => {
      // Lock user record and fetch authoritative balance
      const userRes = await tx.query(
        'SELECT id, username, email, balance, is_active FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (userRes.rows.length === 0) {
        throw { code: 'USER_NOT_FOUND', message: 'User account not found.' };
      }

      const user = userRes.rows[0];

      if (!user.is_active) {
        throw { code: 'ACCOUNT_SUSPENDED', message: 'Account is suspended.' };
      }

      const currentBalance = parseFloat(user.balance);

      if (currentBalance < finalCharge) {
        throw {
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient wallet balance. Order requires ${finalCharge.toFixed(2)} EGP, but your balance is ${currentBalance.toFixed(2)} EGP.`
        };
      }

      const newBalance = parseFloat((currentBalance - finalCharge).toFixed(4));

      // Deduct balance from user
      await tx.query(
        'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newBalance, userId]
      );

      // Snapshot service details into order record
      const insertOrderRes = await tx.query(
        `INSERT INTO orders (
          user_id,
          customer_username_snap,
          customer_email_snap,
          platform,
          category_name_snap,
          service_id,
          service_name_snap,
          service_price_snap,
          username,
          target_link,
          quantity,
          charge,
          currency,
          balance_before,
          balance_after,
          status,
          idempotency_key
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'EGP', $13, $14, 'PENDING', $15
        ) RETURNING *`,
        [
          userId,
          user.username,
          user.email,
          service.platform,
          service.category_name_en || 'General',
          service.id,
          service.name_en,
          pricePer1000,
          username || user.username,
          cleanLink,
          parsedQty,
          finalCharge,
          currentBalance,
          newBalance,
          idempotencyKey
        ]
      );

      const createdOrder = insertOrderRes.rows[0];

      // Record in immutable wallet ledger
      await tx.query(
        `INSERT INTO wallet_transactions (
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          description,
          reference_id
        ) VALUES (
          $1, 'ORDER_CHARGE', $2, $3, $4, $5, $6
        )`,
        [
          userId,
          -finalCharge,
          currentBalance,
          newBalance,
          `Order #${createdOrder.id} - ${service.name_en} (Qty: ${parsedQty})`,
          String(createdOrder.id)
        ]
      );

      // Record order initial creation event
      await tx.query(
        `INSERT INTO order_events (order_id, previous_status, new_status, notes, changed_by)
         VALUES ($1, NULL, 'PENDING', 'Order submitted by customer', $2)`,
        [createdOrder.id, userId]
      );

      // Create in-app notification
      await tx.query(
        `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type, link)
         VALUES ($1, $2, $3, $4, $5, 'order', $6)`,
        [
          userId,
          `Order #${createdOrder.id} Created`,
          `تم إنشاء الطلب #${createdOrder.id}`,
          `Your order for ${service.name_en} has been received and is pending fulfillment.`,
          `تم استلام طلبك لخدمة ${service.name_ar || service.name_en} وهو قيد التنفيذ اليدوي.`,
          `/dashboard?tab=orders`
        ]
      );

      return {
        order: createdOrder,
        newBalance
      };
    });
  }

  /**
   * Cancel and refund an order inside an atomic transaction
   */
  async refundOrder(orderId, adminId, reason = 'Canceled by admin') {
    return await db.transaction(async (tx) => {
      // Lock order
      const orderRes = await tx.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        throw { code: 'ORDER_NOT_FOUND', message: 'Order not found.' };
      }

      const order = orderRes.rows[0];

      if (order.status === 'REFUNDED') {
        throw { code: 'ALREADY_REFUNDED', message: 'This order has already been refunded.' };
      }

      const refundAmount = parseFloat(order.charge);

      // Lock user balance
      const userRes = await tx.query(
        'SELECT id, balance FROM users WHERE id = $1 FOR UPDATE',
        [order.user_id]
      );

      if (userRes.rows.length === 0) {
        throw { code: 'USER_NOT_FOUND', message: 'Customer account not found.' };
      }

      const currentBalance = parseFloat(userRes.rows[0].balance);
      const updatedBalance = parseFloat((currentBalance + refundAmount).toFixed(4));

      // Credit user balance
      await tx.query(
        'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
        [updatedBalance, order.user_id]
      );

      // Update order status
      await tx.query(
        `UPDATE orders 
         SET status = 'REFUNDED', admin_notes = $1, updated_at = NOW() 
         WHERE id = $2`,
        [reason, orderId]
      );

      // Create ledger transaction
      await tx.query(
        `INSERT INTO wallet_transactions (
          user_id, type, amount, balance_before, balance_after, description, reference_id
        ) VALUES ($1, 'REFUND', $2, $3, $4, $5, $6)`,
        [
          order.user_id,
          refundAmount,
          currentBalance,
          updatedBalance,
          `Refund for Order #${order.id} (${reason})`,
          String(order.id)
        ]
      );

      // Record event
      await tx.query(
        `INSERT INTO order_events (order_id, previous_status, new_status, notes, changed_by)
         VALUES ($1, $2, 'REFUNDED', $3, $4)`,
        [order.id, order.status, reason, adminId]
      );

      // Notify customer
      await tx.query(
        `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type)
         VALUES ($1, $2, $3, $4, $5, 'refund')`,
        [
          order.user_id,
          `Order #${order.id} Refunded`,
          `تم استرجاع مبلغ الطلب #${order.id}`,
          `Your order #${order.id} was refunded. ${refundAmount.toFixed(2)} EGP has been credited to your wallet.`,
          `تم استرجاع مبلغ الطلب #${order.id} بقيمة ${refundAmount.toFixed(2)} ج.م إلى محفظتك.`
        ]
      );

      return {
        orderId,
        refundAmount,
        updatedBalance
      };
    });
  }
}

module.exports = new OrderService();
