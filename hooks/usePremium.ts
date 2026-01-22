
import { useAuth } from '../context/AuthContext';

export const usePremium = () => {
  const { user, loading } = useAuth();
  
  return {
    isPremium: user?.isPremium || false,
    loading,
    user
  };
};
