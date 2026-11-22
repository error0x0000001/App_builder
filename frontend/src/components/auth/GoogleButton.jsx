import { useQuery } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints.js';
import { Button } from '../ui/Button.jsx';
import { Divider } from '../ui/Divider.jsx';
import { GoogleIcon } from '../ui/Icon.jsx';

/** "Continue with Google" — rendered only when the API reports the provider is configured. */
export function SocialLogin({ label = 'Continue with Google' }) {
  const { data } = useQuery({ queryKey: ['auth-config'], queryFn: authApi.config, staleTime: Infinity });
  if (!data?.oauth.google) return null;
  return (
    <>
      <Button as="a" href="/api/v1/auth/oauth/google" variant="neutral" fullWidth><GoogleIcon />{label}</Button>
      <Divider>or</Divider>
    </>
  );
}
