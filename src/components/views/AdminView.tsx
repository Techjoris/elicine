import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Users, 
  Crown, 
  Zap, 
  Heart, 
  Search, 
  Download, 
  RefreshCw, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  XCircle, 
  ArrowLeft, 
  Copy, 
  ExternalLink,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  FileJson
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { AdminUserData } from '../../types';

export const AdminView: React.FC = () => {
  const { user, setActiveView, showToast, setIsAuthModalOpen } = useApp();

  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => authService.isAdmin(user));
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    premiumSubscribers: 0,
    freeUsers: 0,
    totalSearches: 0,
    totalSavedMovies: 0,
    conversionRate: '0%'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pro' | 'free' | 'admin'>('all');

  // Check auth whenever user state changes
  useEffect(() => {
    setIsAuthorized(authService.isAdmin(user));
  }, [user]);

  // Load admin data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await authService.getAllAdminUsers();
      setUsers(data.users);
      setMetrics(data.metrics);
    } catch (e) {
      console.error(e);
      showToast('Erreur lors du chargement des données administrateur.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized]);

  const handleUnlockWithPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (authService.verifyAdminPasscode(passcode)) {
      setIsAuthorized(true);
      setPasscodeError(false);
      showToast('Accès administrateur déverrouillé avec succès ! 🛡️');
    } else {
      setPasscodeError(true);
      showToast('Code d\'accès administrateur incorrect.');
    }
  };

  const handleLockSession = () => {
    authService.revokeAdminSession();
    setIsAuthorized(authService.isAdmin(user));
    showToast('Session administrateur verrouillée.');
  };

  const handleTogglePro = async (userId: string, currentPro: boolean) => {
    const newStatus = await authService.toggleUserPro(userId);
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          isPro: newStatus,
          proPlanType: newStatus ? 'yearly' : undefined,
          proPlanExpiresAt: newStatus ? 'Accordé par Admin' : null
        };
      }
      return u;
    }));

    // Recompute metrics
    setMetrics(prev => {
      const diff = newStatus ? 1 : -1;
      const newPremium = Math.max(0, prev.premiumSubscribers + diff);
      const newFree = Math.max(0, prev.totalUsers - newPremium);
      return {
        ...prev,
        premiumSubscribers: newPremium,
        freeUsers: newFree,
        conversionRate: prev.totalUsers > 0 ? ((newPremium / prev.totalUsers) * 100).toFixed(1) + '%' : '0%'
      };
    });

    showToast(newStatus ? 'Pass Pro accordé à l\'utilisateur ! 👑' : 'Pass Pro révoqué.');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copié !`);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (users.length === 0) return;

    const headers = ['ID', 'Nom', 'Pseudo', 'Email', 'Provider', 'Rôle', 'Pass Pro', 'Formule', 'Expiration', 'Code Parrainage', 'Films en Liste', 'Recherches IA', 'Date Inscription'];
    const rows = users.map(u => [
      `"${u.id}"`,
      `"${u.name || ''}"`,
      `"${u.username || ''}"`,
      `"${u.email || ''}"`,
      `"${u.provider || 'credentials'}"`,
      `"${u.role || 'user'}"`,
      u.isPro ? 'OUI' : 'NON',
      `"${u.proPlanType || 'Gratuit'}"`,
      `"${u.proPlanExpiresAt || 'N/A'}"`,
      `"${u.referralCode || ''}"`,
      u.moviesInListCount || 0,
      u.aiQueriesCount || 0,
      `"${new Date(u.createdAt).toLocaleString('fr-FR')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `elicine-utilisateurs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Export CSV téléchargé avec succès ! 📥');
  };

  // Export JSON
  const handleExportJSON = () => {
    if (users.length === 0) return;

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
      exportedAt: new Date().toISOString(),
      metrics,
      users
    }, null, 2));

    const link = document.createElement('a');
    link.href = dataStr;
    link.setAttribute('download', `elicine-utilisateurs-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export JSON téléchargé avec succès ! 📋');
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q || 
        u.name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q) || 
        (u.username && u.username.toLowerCase().includes(q)) ||
        u.referralCode.toLowerCase().includes(q);

      // Status filter
      if (!matchQuery) return false;
      if (statusFilter === 'pro') return u.isPro;
      if (statusFilter === 'free') return !u.isPro;
      if (statusFilter === 'admin') return u.role === 'admin';
      return true;
    });
  }, [users, searchQuery, statusFilter]);

  // UNAUTHORIZED / 403 SCREEN
  if (!isAuthorized) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-zinc-950/90 border border-red-500/30 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-5 animate-fade-in">
          
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 shadow-lg shadow-red-500/10">
            <ShieldAlert className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              403 • Accès Refusé
            </span>
            <h1 className="text-2xl font-black text-white pt-1">
              Espace Administrateur
            </h1>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              Cette console est strictement réservée au créateur d'Éliciné. Veuillez vous identifier ou saisir la clé secrète.
            </p>
          </div>

          {/* Passcode Unlock Form */}
          <form onSubmit={handleUnlockWithPasscode} className="space-y-3 pt-2">
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
              <input
                type="password"
                placeholder="Code secret administrateur..."
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setPasscodeError(false);
                }}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border text-xs text-white placeholder-zinc-500 outline-none transition-all ${
                  passcodeError 
                    ? 'border-red-500 ring-1 ring-red-500/40' 
                    : 'border-zinc-800 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40'
                }`}
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:brightness-110 text-white font-bold text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              <span>Déverrouiller l'accès</span>
            </button>
          </form>

          {/* Fallback actions */}
          <div className="pt-2 border-t border-zinc-900 space-y-2 text-xs">
            {!user ? (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="text-cyan-400 hover:underline block w-full text-center"
              >
                Se connecter avec un compte admin
              </button>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Connecté en tant que : <strong className="text-zinc-300">{user.email}</strong>
              </p>
            )}

            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto pt-1 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retour à l'accueil</span>
            </button>
          </div>

        </div>
      </div>
    );
  }

  // AUTHORIZED ADMIN DASHBOARD
  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              Console Administrateur Éliciné
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Système En Ligne
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Suivi des Inscriptions & Abonnés
          </h1>
          <p className="text-xs text-zinc-400">
            Visionnez la base d'utilisateurs en temps réel, gérez les statuts Pass Pro et exportez vos données.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Télécharger le fichier CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            className="px-3.5 py-2 rounded-xl bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 border border-blue-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Télécharger le fichier JSON"
          >
            <FileJson className="w-3.5 h-3.5 text-blue-400" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleLockSession}
            className="p-2 rounded-xl bg-red-950/30 hover:bg-red-950/60 text-red-300 border border-red-500/30 text-xs transition-colors cursor-pointer"
            title="Verrouiller la console admin"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* METRICS CARDS OVERVIEW */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        
        {/* Card 1: Total Users */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Total Inscrits</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">{metrics.totalUsers}</span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" /> +100%
            </span>
          </div>
          <p className="text-[10px] text-zinc-500">Comptes actifs enregistrés</p>
        </div>

        {/* Card 2: Premium Pass Pro */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/30 backdrop-blur-xl space-y-2 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between text-amber-300 text-xs">
            <span className="font-bold">Abonnés Pass Pro</span>
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-300">{metrics.premiumSubscribers}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
              {metrics.conversionRate} conv.
            </span>
          </div>
          <p className="text-[10px] text-zinc-400">Membres VIP & soutiens</p>
        </div>

        {/* Card 3: Free Users */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Membres Gratuits</span>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-zinc-200">
            {metrics.freeUsers}
          </div>
          <p className="text-[10px] text-zinc-500">3 recherches IA / jour</p>
        </div>

        {/* Card 4: Total Searches */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Recherches IA</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-yellow-300">
            {metrics.totalSearches}
          </div>
          <p className="text-[10px] text-zinc-500">Requêtes traitées</p>
        </div>

        {/* Card 5: Saved Movies */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl space-y-2 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-bold">Films en Watchlist</span>
            <Heart className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-400">
            {metrics.totalSavedMovies}
          </div>
          <p className="text-[10px] text-zinc-500">Favoris synchronisés</p>
        </div>

      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl">
        
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Rechercher par nom, email, pseudo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400 transition-all"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs font-bold w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Tous ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pro')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              statusFilter === 'pro'
                ? 'bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30'
                : 'text-zinc-400 hover:text-amber-300'
            }`}
          >
            <Crown className="w-3 h-3 text-amber-400" />
            Pass Pro ({users.filter(u => u.isPro).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('free')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'free'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Gratuits ({users.filter(u => !u.isPro).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('admin')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'admin'
                ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/30'
                : 'text-zinc-400 hover:text-cyan-300'
            }`}
          >
            Admins ({users.filter(u => u.role === 'admin').length})
          </button>
        </div>

      </div>

      {/* SUBSCRIBERS & USERS TABLE */}
      <div className="rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            
            {/* Table Header */}
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-900/50 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                <th className="p-4 sm:px-6">Utilisateur</th>
                <th className="p-4">Date d'Inscription</th>
                <th className="p-4">Statut Pass Pro</th>
                <th className="p-4">Activité</th>
                <th className="p-4 sm:px-6 text-right">Actions</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-zinc-800/50">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">
                    Aucun utilisateur ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const initials = u.name ? u.name.slice(0, 2).toUpperCase() : 'EC';
                  const isUserAdmin = u.role === 'admin' || authService.isAdmin(u as any);

                  return (
                    <tr key={u.id} className="hover:bg-zinc-900/40 transition-colors">
                      
                      {/* 1. User Identity */}
                      <td className="p-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-9 h-9 rounded-xl object-cover ring-1 ring-zinc-700 flex-shrink-0"
                            />
                          ) : (
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white flex-shrink-0 ${
                              u.isPro
                                ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-zinc-950'
                                : 'bg-gradient-to-tr from-cyan-600 to-blue-600'
                            }`}>
                              {initials}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-white truncate max-w-[150px] sm:max-w-xs">
                                {u.name}
                              </p>
                              {isUserAdmin && (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/30 uppercase">
                                  Admin
                                </span>
                              )}
                              {u.provider === 'google' ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white/10 text-cyan-300 border border-cyan-400/30">
                                  Google
                                </span>
                              ) : (
                                <span className="text-[9px] font-medium text-zinc-500">
                                  @{u.username || 'compte'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1">
                              <span>{u.email}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(u.email, 'Email')}
                                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                                title="Copier l'email"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* 2. Registration Date */}
                      <td className="p-4 text-zinc-300 whitespace-nowrap">
                        <p className="font-medium">
                          {new Date(u.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {u.referralCode}
                        </span>
                      </td>

                      {/* 3. Subscription Status */}
                      <td className="p-4 whitespace-nowrap">
                        {u.isPro ? (
                          <div className="inline-flex flex-col items-start gap-0.5">
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[10px] font-black flex items-center gap-1 shadow-neon-gold">
                              <Crown className="w-3 h-3" />
                              Pass Pro ({u.proPlanType === 'yearly' ? 'Annuel' : 'Mensuel'})
                            </span>
                            {u.proPlanExpiresAt && (
                              <span className="text-[9px] text-zinc-400 pl-1">
                                {u.proPlanExpiresAt}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-semibold">
                            Compte Gratuit
                          </span>
                        )}
                      </td>

                      {/* 4. Activity */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-3 text-zinc-300">
                          <span className="flex items-center gap-1 text-[11px]" title="Films dans Ma Liste">
                            <Heart className="w-3.5 h-3.5 text-red-400" />
                            <strong className="text-white">{u.moviesInListCount || 0}</strong>
                          </span>
                          <span className="flex items-center gap-1 text-[11px]" title="Recherches IA">
                            <Zap className="w-3.5 h-3.5 text-yellow-400" />
                            <strong className="text-white">{u.aiQueriesCount || 0}</strong>
                          </span>
                        </div>
                      </td>

                      {/* 5. Quick Actions */}
                      <td className="p-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleTogglePro(u.id, u.isPro)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all cursor-pointer border ${
                              u.isPro
                                ? 'bg-zinc-900 hover:bg-red-950/40 text-zinc-400 hover:text-red-300 border-zinc-800 hover:border-red-500/40'
                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 shadow-sm'
                            }`}
                            title={u.isPro ? 'Révoquer le Pass Pro' : 'Offrir le Pass Pro VIP'}
                          >
                            {u.isPro ? 'Révoquer Pro' : '+ Accorder Pro'}
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>

          </table>
        </div>
        
        {/* Table Footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/30 text-xs text-zinc-500 flex items-center justify-between flex-wrap gap-2">
          <span>
            Affichage de <strong>{filteredUsers.length}</strong> sur <strong>{users.length}</strong> utilisateurs
          </span>
          <span className="font-mono text-[11px] text-zinc-600">
            Éliciné Admin v1.2 • Sécurisé
          </span>
        </div>
      </div>

    </div>
  );
};

export default AdminView;
