// Couleurs Le Cercle
export const COLORS = {
  // RAL 5008 - Bleu gris (couleur principale)
  primary: '#26252D',
  primaryLight: '#3D3B47',
  primaryDark: '#1A1920',
  
  // RAL 1013 - Beige perle (arrière-plan)
  background: '#EAE6CA',
  backgroundLight: '#F5F2E3',
  backgroundDark: '#DDD9B8',
  
  // Couleurs de statut
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  
  // Couleurs neutres
  white: '#FFFFFF',
  gray: '#6B7280',
  darkGray: '#374151',
  lightGray: '#E5E7EB',
  
  // Accent (pour les étoiles, badges)
  accent: '#FCD34D',
};

// Configuration du système de points
export const LOYALTY_CONFIG = {
  // Gagner des points : 1€ = 1 point
  earnRate: 1,
  earnCurrency: '€',
  
  // Utiliser des points : 100 points = 5€ (5% cashback)
  redeemRate: 0.05, // 1 point = 0.05€
  redeemMinimum: 100, // Minimum 100 points pour utiliser
  
  // Messages
  earnMessage: '1€ dépensé = 1 point',
  redeemMessage: '100 points = 5€ de réduction',
};
