import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.tsx';
import { authReturnPath } from '../utils/authRedirect.ts';

/**
 * Para las páginas de acceso (login, registro, recuperar contraseña).
 * - Si ya hay una sesión abierta (por ejemplo, al volver con "atrás"), lleva de
 *   inmediato a la página de origen sin dejar el formulario en el historial.
 * - `finish()` termina el acceso reemplazando la entrada del formulario, para
 *   que "atrás" no vuelva a mostrar "Iniciar sesión" estando conectado.
 */
export function useGuestOnly() {
  const { currentUser, authReady } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const submitting = useRef(false);
  const target = authReturnPath(location.state);

  useEffect(() => {
    if (authReady && currentUser && !submitting.current) {
      navigate(target, { replace: true });
    }
  }, [authReady, currentUser, navigate, target]);

  const finish = (override?: string) => {
    navigate(override ?? target, { replace: true });
    window.scrollTo({ top: 0 });
  };

  // Mientras se redirige no se muestra el formulario (evita un parpadeo).
  const redirecting = authReady && Boolean(currentUser) && !submitting.current;

  return { submitting, finish, target, redirecting };
}
