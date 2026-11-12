// Reutiliza api/admin.js en Netlify: comprueba el rol de administrador y gestiona el inventario.
import handler from '../../api/admin.js';
import { fromVercel } from '../lib/adaptador-vercel.mjs';

export default fromVercel(handler);
export const config = { path: '/api/admin' };
