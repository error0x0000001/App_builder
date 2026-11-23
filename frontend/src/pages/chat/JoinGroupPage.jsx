import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chatApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';

/** Opens a group invite link: joins the group, then shows it. */
export default function JoinGroupPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    chatApi.join(code)
      .then(async (data) => { await qc.invalidateQueries({ queryKey: ['chat'] }); if (!cancelled) navigate(`/app/chat/${data.conversation.id}`, { replace: true }); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [code, navigate, qc]);
  return <div className="grid h-full place-items-center p-6">{error ? <Alert tone="error">{error}</Alert> : <Spinner />}</div>;
}
