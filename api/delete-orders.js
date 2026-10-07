const json = (response, status, body) => {
  response.status(status).setHeader('Cache-Control', 'no-store').json(body);
};

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('Delete orders environment variables are incomplete.');
    return json(response, 500, { error: 'Order deletion is not configured.' });
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
      return json(response, 403, { error: 'Could not verify admin permission.' });
    }

    const isAdmin = await adminCheckResponse.json();
    if (isAdmin !== true) return json(response, 403, { error: 'This account is not allowed to delete orders.' });

    const orderId = typeof request.body?.orderId === 'string' ? request.body.orderId.trim() : '';
    const deleteAll = request.body?.confirmation === 'DELETE ALL';

    if (!deleteAll && !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return json(response, 400, { error: 'A valid order ID is required.' });
    }

    const serviceHeaders = {
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    if (serviceRoleKey.split('.').length === 3) {
      serviceHeaders.Authorization = `Bearer ${serviceRoleKey}`;
    }

    const deleteUrl = deleteAll
      ? `${supabaseUrl}/rest/v1/orders?id=not.is.null`
      : `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`;

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: serviceHeaders,
    });

    if (!deleteResponse.ok) {
      const details = (await deleteResponse.text()).slice(0, 800);
      console.error('Supabase rejected order deletion.', deleteResponse.status, details);
      return json(response, 502, { error: 'Database rejected the delete request.' });
    }

    const deletedRows = await deleteResponse.json().catch(() => []);
    const deleted = Array.isArray(deletedRows) ? deletedRows.length : 0;

    if (!deleteAll && deleted === 0) {
      return json(response, 404, { error: 'Order was not found or was already deleted.' });
    }

    return json(response, 200, { deleted, orderId: deleteAll ? null : orderId });
  } catch (error) {
    console.error('Delete all orders failed.', error);
    return json(response, 500, { error: 'Delete all orders failed unexpectedly.' });
  }
};
