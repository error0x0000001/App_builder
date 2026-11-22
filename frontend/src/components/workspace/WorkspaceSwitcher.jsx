import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Select } from '../ui/Select.jsx';

const NEW_WORKSPACE = '__new__';

export function WorkspaceSwitcher({ iconOnly = false }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  if (iconOnly) return <span title={activeWorkspace?.name} className="mx-auto"><Avatar name={activeWorkspace?.name ?? '?'} size="size-9" /></span>;

  const onChange = async (event) => {
    if (event.target.value === NEW_WORKSPACE) return navigate('/app/workspaces/new');
    await switchWorkspace(event.target.value);
    navigate('/app');
  };
  return (
    <Select
      aria-label="Workspace"
      value={activeWorkspace?.id ?? ''}
      onChange={onChange}
      options={[...workspaces.map((w) => ({ value: w.id, label: w.name })), { value: NEW_WORKSPACE, label: '+ New workspace' }]}
      placeholder={activeWorkspace ? undefined : 'No workspace'}
    />
  );
}
