const ALLOWED_STATUSES = new Set(['confirmed', 'shipped', 'delivered', 'cancelled']);

const json = (response, status, body) => {
  response.status(status).setHeader('Cache-Control', 'no-store').json(body);
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;
  const siteUrl = (process.env.SITE_URL || 'https://www.wjnoir.store').replace(/\/$/, '');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !resendApiKey || !adminEmail || !fromEmail) {
    console.error('Order status email environment variables are incomplete.');
    return json(response, 500, { error: 'Email service is not fully configured.' });
  }

  try {
    const authorization = request.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return json(response, 401, { error: 'Admin authentication is required.' });

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!userResponse.ok) return json(response, 401, { error: 'Your admin session is invalid or expired.' });

    const user = await userResponse.json();
    if (!user?.email) return json(response, 401, { error: 'Your admin session could not be verified.' });

    // Check the same Supabase allowlist used by the admin dashboard instead of
    // relying on a possibly different Vercel ADMIN_EMAIL value.
    const adminCheckResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/is_order_admin`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!adminCheckResponse.ok) {
      console.error('Admin allowlist check failed.', adminCheckResponse.status, await adminCheckResponse.text());
      return json(response, 403, { error: 'Could not verify admin permission. Please sign in again.' });
    }
    const isAdmin = await adminCheckResponse.json();
    if (isAdmin !== true) return json(response, 403, { error: 'This account is not allowed to send order emails.' });

    const { orderId, status } = request.body || {};
    if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId) || !ALLOWED_STATUSES.has(status)) {
      return json(response, 400, { error: 'Invalid order or status.' });
    }

    const serviceHeaders = {
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    };
    if (serviceRoleKey.split('.').length === 3) {
      serviceHeaders.Authorization = `Bearer ${serviceRoleKey}`;
    }

    const orderQuery = `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*`;
    const itemsQuery = `${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_name,size_ml,quantity,unit_price`;

    const [orderResponse, itemsResponse] = await Promise.all([
      fetch(orderQuery, { headers: serviceHeaders }),
      fetch(itemsQuery, { headers: serviceHeaders }),
    ]);

    if (!orderResponse.ok || !itemsResponse.ok) {
      console.error('Unable to load order for status email.', orderResponse.status, itemsResponse.status);
      return json(response, 502, { error: 'Could not load the order for email delivery.' });
    }

    const [orders, items] = await Promise.all([orderResponse.json(), itemsResponse.json()]);
    const order = orders?.[0];
    if (!order || !Array.isArray(items)) return json(response, 404, { error: 'Order not found.' });
    if (order.status !== status) return json(response, 409, { error: 'Order status changed before the email was sent. Refresh and try again.' });

    const statusCopy = {
      confirmed: {
        subject: `WJ NOIR order ${order.order_number} confirmed`,
        eyebrow: 'ORDER CONFIRMED',
        title: 'Your order is confirmed.',
        message: 'Your WJ NOIR order has been confirmed. Our team will contact you for delivery coordination. Payment remains Cash on Delivery.',
      },
      shipped: {
        subject: `WJ NOIR order ${order.order_number} is on the way`,
        eyebrow: 'ORDER SHIPPED',
        title: 'Your fragrance is on the way.',
        message: 'Your WJ NOIR order has been marked as shipped. Please keep your phone available for delivery coordination.',
      },
      delivered: {
        subject: `WJ NOIR order ${order.order_number} delivered`,
        eyebrow: 'ORDER DELIVERED',
        title: 'Delivered. Wear your presence.',
        message: 'Your WJ NOIR order has been marked as delivered. Thank you for choosing WJ NOIR.',
      },
      cancelled: {
        subject: `WJ NOIR order ${order.order_number} cancelled`,
        eyebrow: 'ORDER CANCELLED',
        title: 'Your order has been cancelled.',
        message: 'Your WJ NOIR order has been cancelled. If this was unexpected, reply to this email or contact WJ NOIR for assistance.',
      },
    }[status];

    const money = (amount) => `PKR ${Number(amount).toLocaleString('en-PK')}`;
    const rows = items.map((item) => {
      const quantity = Number(item.quantity);
      return `<tr>
        <td style="padding:13px 0;border-bottom:1px solid #e8e5dd;color:#24241f">${escapeHtml(item.product_name)} · ${escapeHtml(item.size_ml)} ml × ${quantity}</td>
        <td style="padding:13px 0;border-bottom:1px solid #e8e5dd;text-align:right;white-space:nowrap;color:#24241f">${money(Number(item.unit_price) * quantity)}</td>
      </tr>`;
    }).join('');

    const address = [order.address, order.city, order.state, order.postal_code, order.country].filter(Boolean).join(', ');
    const logoUrl = `${siteUrl}/assets/wj-noir-logo.png`;
    const html = `<!doctype html>
      <html>
      <body style="margin:0;padding:30px 12px;background:#f3f1eb;color:#24241f;font-family:Arial,sans-serif">
        <table role="presentation" style="width:100%;max-width:620px;margin:0 auto;background:#fff;border-collapse:collapse">
          <tr><td style="padding:30px 36px;text-align:center;background:#10110f">
            <img src="${logoUrl}" width="112" alt="WJ NOIR" style="display:inline-block;width:112px;height:auto"/>
          </td></tr>
          <tr><td style="padding:38px">
            <p style="margin:0 0 10px;color:#8b887f;font-size:10px;letter-spacing:2.5px">${statusCopy.eyebrow} · ${escapeHtml(order.order_number)}</p>
            <h1 style="margin:0 0 15px;font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15">${statusCopy.title}</h1>
            <p style="margin:0;color:#66665e;font-size:14px;line-height:1.8">Hello ${escapeHtml(order.customer_name)}, ${statusCopy.message}</p>
            <table role="presentation" style="width:100%;margin-top:26px;border-collapse:collapse;font-size:13px">${rows}
              <tr><td style="padding:18px 0;font-weight:bold">Total · ${escapeHtml(order.payment_method)}</td><td style="padding:18px 0;text-align:right;font-weight:bold;white-space:nowrap">${money(order.total_amount)}</td></tr>
            </table>
            <p style="margin:22px 0 0;color:#66665e;font-size:12px;line-height:1.8"><strong>Delivery address</strong><br/>${escapeHtml(address)}</p>
          </td></tr>
          <tr><td style="padding:19px 36px;background:#f6f5f0;color:#77756d;font-size:11px">WJ NOIR · Three distinct signatures. One fragrance house.</td></tr>
        </table>
      </body>
      </html>`;

    const normalizedFrom = /<[^<>\s]+@[^<>\s]+>|^[^\s<>]+@[^\s<>]+$/.test(fromEmail.trim())
      ? fromEmail.trim()
      : 'WJ NOIR <orders@wjnoir.store>';

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: normalizedFrom,
        to: [order.email],
        reply_to: adminEmail,
        subject: statusCopy.subject,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.json().catch(async () => ({ message: (await resendResponse.text()).slice(0, 500) }));
      const reason = String(resendError?.message || resendError?.name || 'Resend rejected the email.').replace(/\s+/g, ' ').trim();
      console.error('Resend rejected order status email.', resendResponse.status, reason);
      return json(response, 502, {
        error: `Resend error ${resendResponse.status}: ${reason}`,
        stage: 'resend'
      });
    }

    const resendResult = await resendResponse.json().catch(() => ({}));
    return json(response, 200, { sent: true, id: resendResult.id || null });
  } catch (error) {
    console.error('Order status email failed.', error);
    return json(response, 500, { error: 'Order status email failed unexpectedly.' });
  }
};
