function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function err(res, code, message, status = 500, details = undefined, compat = true) {
  const payload = {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
  if (compat) payload.errorLegacy = message; // for old clients (transition)
  return res.status(status).json(payload);
}

module.exports = { ok, err };
