const DEFAULT_PASSWORD_MIN_LENGTH = 6;

const parsed = Number(import.meta.env.VITE_AUTH_PASSWORD_MIN_LENGTH || DEFAULT_PASSWORD_MIN_LENGTH);
const safe = Number.isFinite(parsed) ? Math.floor(parsed) : DEFAULT_PASSWORD_MIN_LENGTH;

export const PASSWORD_MIN_LENGTH = Math.max(1, safe);
