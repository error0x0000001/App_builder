import { Outlet } from 'react-router-dom';
import { AuthShell } from './AuthShell.jsx';

export const AuthLayout = () => <AuthShell><Outlet /></AuthShell>;
