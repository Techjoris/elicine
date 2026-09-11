import React from 'react';
import { useApp } from '../../context/AppContext';
import { UpdatePassword } from '../auth/UpdatePassword';

export const ResetPasswordView: React.FC = () => {
  const { setActiveView, setIsAuthModalOpen, showToast } = useApp();

  return (
    <div className="flex items-center justify-center min-h-[65vh] p-4">
      <UpdatePassword
        onSuccess={() => {
          showToast("Votre mot de passe a été mis à jour avec succès !");
        }}
        onGoHome={() => {
          setActiveView('home');
          setIsAuthModalOpen(true);
        }}
      />
    </div>
  );
};

export default ResetPasswordView;
