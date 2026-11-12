// Reutiliza api/public-config.js en Netlify (el login de administración lo necesita).
import handler from '../../api/public-config.js';
import { fromVercel } from '../lib/adaptador-vercel.mjs';

export default fromVercel(handler);
export const config = { path: '/api/public-config' };
