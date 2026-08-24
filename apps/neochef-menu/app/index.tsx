import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Image,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { WebIcon } from './components/WebIcon';
import * as Font from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as XLSX from 'xlsx';

// ==================== UPDATE NOTIFICATION COMPONENT ====================
function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const slideAnim = useState(new Animated.Value(100))[0];

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleServiceWorkerUpdate = () => {
      navigator.serviceWorker.ready.then(registration => {
        // Check for updates periodically
        registration.update();

        // Listen for new service worker
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                setWaitingWorker(newWorker);
                setShowUpdate(true);
                Animated.spring(slideAnim, {
                  toValue: 0,
                  useNativeDriver: true,
                  tension: 50,
                  friction: 8,
                }).start();
              }
            });
          }
        });
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('[App] Service Worker updated to:', event.data.version);
        }
      });

      // Listen for controller change (new SW took over)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (showUpdate) {
          window.location.reload();
        }
      });
    };

    handleServiceWorkerUpdate();
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      // Tell the waiting service worker to skip waiting
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload the page to get the new version
    window.location.reload();
  };

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowUpdate(false));
  };

  if (!showUpdate) return null;

  return (
    <Animated.View 
      style={{
        position: 'absolute',
        bottom: 90,
        left: 16,
        right: 16,
        backgroundColor: '#26252D',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 99999,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#F5F0E8', fontWeight: 'bold', fontSize: 15 }}>
          🎉 Nouvelle version disponible !
        </Text>
        <Text style={{ color: '#F5F0E8', opacity: 0.8, fontSize: 13, marginTop: 4 }}>
          Cliquez pour mettre à jour
        </Text>
      </View>
      <TouchableOpacity 
        onPress={handleDismiss}
        style={{ padding: 8, marginRight: 8 }}
      >
        <Text style={{ color: '#F5F0E8', opacity: 0.6 }}>Plus tard</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        onPress={handleUpdate}
        style={{ 
          backgroundColor: '#4CAF50', 
          paddingHorizontal: 16, 
          paddingVertical: 10, 
          borderRadius: 8 
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Mettre à jour</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// SafeAreaWrapper - wraps content with background extending to screen edges (for iOS PWA)
// OPTIMISÉ: Pas de padding supplémentaire - le contenu utilise tout l'espace disponible
const SafeAreaWrapper = ({ children, backgroundColor, bottomBackgroundColor, style, addBottomPadding = false }: { children: React.ReactNode, backgroundColor: string, bottomBackgroundColor?: string, style?: any, addBottomPadding?: boolean }) => {
  // Sur le web (PWA), ne pas ajouter de padding - laisser le contenu utiliser tout l'espace
  if (Platform.OS === 'web') {
    return (
      <View style={[{ flex: 1, backgroundColor }, style]}>
        {children}
        {/* Zone en bas pour couvrir le safe area iOS avec la couleur appropriée */}
        {bottomBackgroundColor && (
          <View style={{ 
            position: 'absolute', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            height: 50, 
            backgroundColor: bottomBackgroundColor,
            zIndex: -1
          }} />
        )}
      </View>
    );
  }
  
  // Sur mobile natif, utiliser SafeAreaView
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <SafeAreaView style={[{ flex: 1 }, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
};

// Web-compatible alert function
const showAlert = (title: string, message: string, buttons?: Array<{text: string, style?: string, onPress?: () => void}>) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      // Find the destructive/confirm button
      const confirmButton = buttons.find(b => b.style === 'destructive' || b.text === 'OK' || b.text === 'Supprimer' || b.text === 'Oui');
      if (confirmButton && window.confirm(`${title}\n\n${message}`)) {
        confirmButton.onPress?.();
      }
    } else {
      window.alert(`${title}: ${message}`);
    }
  } else {
    // Use native Alert on mobile
    Alert.alert(title, message, buttons);
  }
};

// Cross-platform confirm dialog
const showConfirm = (message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(message));
    } else {
      Alert.alert(
        'Confirmation',
        message,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
          { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    }
  });
};

// Preload Ionicons font for web
if (Platform.OS === 'web') {
  Font.loadAsync({
    ...Ionicons.font,
  });
}

// Function to update PWA safe area colors dynamically (iOS)
const updatePWASafeAreaColor = (topColor: string, bottomColor?: string) => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    // Update CSS variable
    document.documentElement.style.setProperty('--app-header-color', topColor);
    
    // Update body background to match header (for safe areas)
    document.body.style.backgroundColor = topColor;
    
    // CRITICAL: Remove any padding from body that might have been added
    // The safe area padding should be handled by the app components, not the body
    document.body.style.padding = '0';
    document.body.style.paddingTop = '0';
    document.body.style.paddingBottom = '0';
    document.body.style.margin = '0';
    
    // Also set html element
    document.documentElement.style.backgroundColor = topColor;
    document.documentElement.style.padding = '0';
    document.documentElement.style.margin = '0';
    
    // Remove the old cover elements if they exist - they cause issues
    const oldTopCover = document.querySelector('.safe-area-top-cover');
    const oldBottomCover = document.querySelector('.safe-area-bottom-cover');
    if (oldTopCover) oldTopCover.remove();
    if (oldBottomCover) oldBottomCover.remove();
    
    // Si une couleur de fond pour le bas est spécifiée, créer un élément pour couvrir cette zone
    if (bottomColor) {
      let bottomCover = document.getElementById('bottom-safe-area-cover');
      if (!bottomCover) {
        bottomCover = document.createElement('div');
        bottomCover.id = 'bottom-safe-area-cover';
        bottomCover.style.cssText = `
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: env(safe-area-inset-bottom, 34px);
          z-index: 9998;
          pointer-events: none;
        `;
        document.body.appendChild(bottomCover);
      }
      bottomCover.style.backgroundColor = bottomColor;
      bottomCover.style.display = 'block';
    } else {
      // Masquer le cover si pas de bottomColor
      const bottomCover = document.getElementById('bottom-safe-area-cover');
      if (bottomCover) {
        bottomCover.style.display = 'none';
      }
    }
    
    // Update theme-color meta tag
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', topColor);
    }
  }
};

// Initialize safe area handling on app load
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // Set initial color (header color)
  const initialColor = '#26252D';
  
  // Apply critical CSS fixes for PWA safe areas
  const style = document.createElement('style');
  style.textContent = `
    /* PWA Safe Area Critical Fix - Reset body/html */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: ${initialColor} !important;
      min-height: 100vh;
      min-height: 100dvh;
      min-height: -webkit-fill-available;
    }
    #root {
      min-height: 100vh;
      min-height: 100dvh;
      min-height: -webkit-fill-available;
      background-color: ${initialColor};
    }
    /* Remove any existing safe area covers from build */
    .safe-area-top-cover, .safe-area-bottom-cover {
      display: none !important;
    }
    /* Override React Native Web safe area padding classes */
    .r-97e31f {
      padding-bottom: 0 !important;
    }
    /* Header - extend to top edge with padding for status bar */
    [data-testid="app-header"] {
      padding-top: env(safe-area-inset-top, 44px) !important;
      box-sizing: border-box !important;
    }
    /* Bottom Nav - Fixed to absolute bottom - force styles */
    [data-testid="bottom-nav"] {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 1000 !important;
      padding-bottom: env(safe-area-inset-bottom, 34px) !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
  
  updatePWASafeAreaColor(initialColor);
}

// Get backend URL from environment variables (no hardcoded fallback for deployment)
const getBackendUrl = (): string => {
  // For web platform, ALWAYS use window.location.origin first
  // This ensures the static build works in any deployment environment
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    // Use current origin for all deployed environments
    // This works for both production (.emergent.host) and preview (.preview.emergentagent.com)
    return origin;
  }
  
  // For mobile, check app.json extra config first
  const expoUrl = Constants.expoConfig?.extra?.EXPO_BACKEND_URL;
  if (expoUrl) return expoUrl;
  
  // Fallback to EXPO_PUBLIC_BACKEND_URL if available
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  
  // No hardcoded fallback - will fail if not configured
  console.error('Backend URL not configured! Set EXPO_PUBLIC_BACKEND_URL in .env');
  return '';
};

const API_BASE_URL = getBackendUrl();
const API_URL = `${API_BASE_URL}/api`;

interface Restaurant { restaurant_id: string; name: string; description: string | null; logo_base64: string | null; primary_color: string; secondary_color: string; }
interface UserPermissions { 
  menu_groupe: boolean; 
  taches: boolean; 
  preparation_commande: boolean; 
  fiche_technique: boolean; 
  fiche_technique_access: 'none' | 'bar' | 'cuisine' | 'both'; 
  categories: string[];
  menu_restaurant?: boolean;
  events?: boolean;
  evenements?: boolean;
  facturation?: boolean;
  prestataires?: boolean;
  menu_client?: boolean;
  menu_restaurant_en_cours?: boolean;
}
interface User { user_id: string; email: string; name: string; role: 'admin' | 'staff' | 'holding'; restaurant_id: string | null; restaurant_ids?: string[]; holding_name?: string; assigned_categories: string[]; permissions?: UserPermissions; notification_prefs: { push: boolean; email: boolean; sms: boolean; }; }
interface Category { category_id: string; name: string; order: number; }
interface TaskTemplate { template_id: string; category_id: string; title: string; description?: string; is_active: boolean; task_type?: string; recurrence_rule?: any; recurrence_display?: string; }
interface Subtask { subtask_id: string; parent_template_id: string; name: string; quantity?: number; is_active: boolean; }
interface DailyTask { task_id: string; template_id?: string; category_id?: string; title: string; description?: string; date: string; status: 'pending' | 'completed'; is_recurring: boolean; is_sent: boolean; assigned_user_id?: string; assigned_user_name?: string; completed_by?: string; completed_at?: string; is_permanent?: boolean; permanent_task_id?: string; permanent_category_id?: string; permanent_category_name?: string; }
interface TaskHistory { history_id: string; task_id: string; user_id: string; user_name: string; action: string; timestamp: string; }

// Menu Groupe Interfaces
interface MenuSection { section_id: string; name: string; description?: string; order: number; price?: number; }
interface MenuItem { item_id: string; section_id: string; name: string; description?: string; order: number; cooking_options?: string[]; requires_cooking_choice?: boolean; }
interface GroupReservation { reservation_id: string; client_name: string; client_surname: string; client_email?: string; client_phone?: string; num_people: number; date: string; time: string; selected_sections: string[]; selected_items: {[key: string]: string[]}; price_per_person?: number; client_token: string; client_selections?: any; status: string; client_link?: string; proposal_status?: string; is_credit_client?: boolean; }
interface Prestataire { prestataire_id: string; restaurant_id: string; nom_societe: string; contact?: string; telephone?: string; email?: string; note?: string; tarifs?: string; created_at?: string; updated_at?: string; }

const DEFAULT_PRIMARY = '#0b1220';
const DEFAULT_SECONDARY = '#e8f1ff';

// ==================== FONCTION UNIVERSELLE TÉLÉCHARGEMENT/PARTAGE PWA ====================
// Cette fonction gère le téléchargement de fichiers de manière fiable sur toutes les plateformes,
// en particulier sur iOS PWA où seul navigator.share() fonctionne correctement.
const downloadOrShareFile = async (
  fileUrl: string, 
  filename: string, 
  mimeType: string = 'application/pdf',
  authToken?: string
): Promise<boolean> => {
  try {
    // Sur iOS/Android natif, utiliser expo-sharing ou expo-file-system
    if (Platform.OS !== 'web') {
      // Pour l'instant, ouvrir l'URL dans le navigateur externe sur iOS/Android natif
      const { Linking } = await import('react-native');
      await Linking.openURL(fileUrl);
      return true;
    }
    
    // === WEB ONLY CODE BELOW ===
    
    // Préparer les headers si un token est fourni
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    // Récupérer le fichier
    const response = await fetch(fileUrl, { headers });
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('Fichier vide reçu');
    }
    
    // Créer un objet File pour le partage
    const file = new File([blob], filename, { type: mimeType });
    
    // iOS PWA: Utiliser navigator.share() qui déclenche la feuille de partage native
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const shareData = { files: [file], title: filename };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return true;
        }
      } catch (shareError: any) {
        // L'utilisateur a annulé le partage, ce n'est pas une erreur
        if (shareError.name === 'AbortError') {
          return true;
        }
        console.log('Share fallback needed:', shareError);
      }
    }
    
    // Desktop/Android fallback: Créer un lien de téléchargement
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
    return true;
    
  } catch (error: any) {
    console.error('Erreur téléchargement:', error);
    // Dernier recours: ouvrir dans une nouvelle fenêtre
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(fileUrl, '_blank');
    }
    return false;
  }
};

export default function MiseEnPlaceApp() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<'users' | 'settings' | 'ficheTechnique' | 'menuRestaurant' | 'menuRestaurantDraft' | 'rapportArdoise' | 'superadmin'>('menuRestaurant');
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Super Admin State
  const [superadminRestaurants, setSuperadminRestaurants] = useState<any[]>([]);
  const [allUsersAdmin, setAllUsersAdmin] = useState<any[]>([]);
  const [superadminStats, setSuperadminStats] = useState<any>(null);
  
  const [showManagerMenu, setShowManagerMenu] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  
  // Fiche Technique State
  const [ficheSections, setFicheSections] = useState<any[]>([]);
  const [ficheProducts, setFicheProducts] = useState<any[]>([]);
  
  // Menu Restaurant State (Carte Food & Carte Boisson)
  const [menuRestaurantSections, setMenuRestaurantSections] = useState<any[]>([]);
  const [menuRestaurantItems, setMenuRestaurantItems] = useState<any[]>([]);
  const [menuRestaurantNotes, setMenuRestaurantNotes] = useState<any[]>([]);
  
  // Menu Restaurant en cours (Brouillon/Draft) State
  const [menuRestaurantDraftSections, setMenuRestaurantDraftSections] = useState<any[]>([]);
  const [menuRestaurantDraftItems, setMenuRestaurantDraftItems] = useState<any[]>([]);
  const [menuRestaurantDraftNotes, setMenuRestaurantDraftNotes] = useState<any[]>([]);
  const [isDraftModified, setIsDraftModified] = useState(false);
  
  // Ardoise State (Rapport des ventes)
  const [ardoiseData, setArdoiseData] = useState<any>(null);
  const [ardoiseSalesHistory, setArdoiseSalesHistory] = useState<any[]>([]);
  const [ardoiseReportPeriod, setArdoiseReportPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [ardoiseReport, setArdoiseReport] = useState<any>(null);
  
  // État pour le menu public (QR code)
  const [publicMenuRestaurantId, setPublicMenuRestaurantId] = useState<string | null>(null);
  
  // Multi-Restaurant State
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [showRestaurantPicker, setShowRestaurantPicker] = useState(false);
  const [showCreateRestaurantModal, setShowCreateRestaurantModal] = useState(false);
  const [showLinkRestaurantModal, setShowLinkRestaurantModal] = useState(false);
  const [showHoldingManagement, setShowHoldingManagement] = useState(false);
  const [showCreateHoldingModal, setShowCreateHoldingModal] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [newRestaurantDescription, setNewRestaurantDescription] = useState('');
  const [isCreatingRestaurant, setIsCreatingRestaurant] = useState(false);
  const [linkRestaurantEmail, setLinkRestaurantEmail] = useState('');
  const [linkRestaurantPassword, setLinkRestaurantPassword] = useState('');
  const [isLinkingRestaurant, setIsLinkingRestaurant] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [newHoldingName, setNewHoldingName] = useState('');
  const [newHoldingEmail, setNewHoldingEmail] = useState('');
  const [newHoldingPassword, setNewHoldingPassword] = useState('');
  const [isCreatingHolding, setIsCreatingHolding] = useState(false);
  
  // Changer mot de passe
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  const primaryColor = restaurant?.primary_color || DEFAULT_PRIMARY;
  const secondaryColor = restaurant?.secondary_color || DEFAULT_SECONDARY;

  // Inject PWA meta tags for iOS Safari "Add to Home Screen"
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const head = document.head;
      
      // Set page title
      document.title = 'NeoChef';
      
      // Add apple-touch-icon
      if (!document.querySelector('link[rel="apple-touch-icon"]')) {
        const appleIcon = document.createElement('link');
        appleIcon.rel = 'apple-touch-icon';
        appleIcon.href = '/apple-touch-icon.png';
        head.appendChild(appleIcon);
        
        const appleIcon180 = document.createElement('link');
        appleIcon180.rel = 'apple-touch-icon';
        appleIcon180.setAttribute('sizes', '180x180');
        appleIcon180.href = '/apple-touch-icon-180x180.png';
        head.appendChild(appleIcon180);
      }
      
      // Add manifest link
      if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement('link');
        manifest.rel = 'manifest';
        manifest.href = '/manifest.json';
        head.appendChild(manifest);
      }
      
      // Add iOS PWA meta tags
      if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        const capable = document.createElement('meta');
        capable.name = 'apple-mobile-web-app-capable';
        capable.content = 'yes';
        head.appendChild(capable);
        
        const statusBar = document.createElement('meta');
        statusBar.name = 'apple-mobile-web-app-status-bar-style';
        statusBar.content = 'black-translucent';
        head.appendChild(statusBar);
        
        const titleMeta = document.createElement('meta');
        titleMeta.name = 'apple-mobile-web-app-title';
        titleMeta.content = 'NeoChef';
        head.appendChild(titleMeta);
      }
      
      console.log('[PWA] Meta tags injected');
    }
  }, []);

  // Read URL hash on mount — allows the top-level landing to open a specific section (e.g. #settings)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'settings' || hash === 'parametres') setCurrentScreen('settings');
      else if (hash === 'users' || hash === 'equipe') setCurrentScreen('users');
      else if (hash === 'ficheTechnique' || hash === 'fiche') setCurrentScreen('ficheTechnique');
      else if (hash === 'menuRestaurant' || hash === 'menu') setCurrentScreen('menuRestaurant');
      else if (hash === 'rapportArdoise' || hash === 'ardoise') setCurrentScreen('rapportArdoise');
    }
  }, []);

  // Update PWA safe area colors when primary color changes
  useEffect(() => {
    updatePWASafeAreaColor(primaryColor);
  }, [primaryColor]);
  
  // Update bottom safe area color based on current screen (for screens without bottom nav)
  useEffect(() => {
    const screensWithoutBottomNav = ['ficheTechnique', 'menuRestaurant', 'menuRestaurantDraft', 'rapportArdoise'];
    const needsBottomCover = screensWithoutBottomNav.includes(currentScreen);
    
    if (needsBottomCover && secondaryColor) {
      // Écrans sans bottom nav: utiliser secondaryColor en bas
      updatePWASafeAreaColor(primaryColor, secondaryColor);
    } else {
      // Écrans avec bottom nav: utiliser primaryColor en bas aussi (pour couvrir la safe area)
      updatePWASafeAreaColor(primaryColor, primaryColor);
    }
  }, [currentScreen, primaryColor, secondaryColor]);

  const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (!response.ok) { const error = await response.json().catch(() => ({ detail: 'Erreur serveur' })); throw new Error(error.detail || 'Erreur serveur'); }
    return response.json();
  };

  // Check for URL params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      // Clean old params not relevant to this app
      if (urlParams.has('group_token') || urlParams.has('group_request') || urlParams.has('track_group')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      // Check for menu (menu public QR code)
      const menuRestId = urlParams.get('menu');
      if (menuRestId) {
        setPublicMenuRestaurantId(menuRestId);
        setIsLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
    }
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) { setSessionToken(token); await fetchUserData(token); }
    } catch (error) { console.error('Error loading session:', error); }
    finally { setIsLoading(false); }
  };

  const fetchUserData = async (token: string) => {
    try {
      const data = await apiRequest('/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
      setUser(data.user);
      setRestaurant(data.restaurant);
      await loadCategories(token);
      await loadUsers(token);
      // Charger la liste des restaurants pour les admins
      if (data.user.role === 'admin') {
        await loadMyRestaurants(token);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      await AsyncStorage.removeItem('session_token');
      setSessionToken(null);
    }
  };

  const loadCategories = async (token?: string) => {
    try { const data = await apiRequest('/categories/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setCategories(data); }
    catch (error) { console.error('Error loading categories:', error); }
  };

  const loadUsers = async (token?: string) => {
    try { const data = await apiRequest('/users/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setUsers(data); }
    catch (error) { console.error('Error loading users:', error); }
  };

  // Super Admin Functions
  const loadSuperadminData = async () => {
    try {
      const [restaurants, users, stats] = await Promise.all([
        apiRequest('/superadmin/restaurants'),
        apiRequest('/superadmin/users'),
        apiRequest('/superadmin/stats')
      ]);
      setSuperadminRestaurants(restaurants || []);
      setAllUsersAdmin(users || []);
      setSuperadminStats(stats);
    } catch (error) {
      console.error('Error loading superadmin data:', error);
    }
  };

  // Fiche Technique Functions
  const loadFicheSections = async (token?: string) => {
    try { 
      const data = await apiRequest('/fiche-sections/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setFicheSections(data); 
    }
    catch (error) { console.error('Error loading fiche sections:', error); }
  };

  const loadFicheProducts = async (token?: string) => {
    try { 
      const data = await apiRequest('/fiche-products/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setFicheProducts(data); 
    }
    catch (error) { console.error('Error loading fiche products:', error); }
  };

  // Menu Restaurant Functions (Carte Food & Carte Boisson)
  const loadMenuRestaurantSections = async (token?: string) => {
    try { 
      console.log('[LOAD] Loading menu restaurant sections...');
      const data = await apiRequest('/menu-restaurant/sections/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      console.log('[LOAD] Menu restaurant sections loaded:', data?.length || 0, 'sections');
      setMenuRestaurantSections(data); 
    }
    catch (error) { console.error('Error loading menu restaurant sections:', error); }
  };

  const loadMenuRestaurantItems = async (token?: string) => {
    try { 
      console.log('[LOAD] Loading menu restaurant items...');
      const data = await apiRequest('/menu-restaurant/items/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      console.log('[LOAD] Menu restaurant items loaded:', data?.length || 0, 'items');
      setMenuRestaurantItems(data); 
    }
    catch (error) { console.error('Error loading menu restaurant items:', error); }
  };

  const loadMenuRestaurantNotes = async (token?: string) => {
    try { 
      const data = await apiRequest('/menu-restaurant/notes/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setMenuRestaurantNotes(data); 
    }
    catch (error) { console.error('Error loading menu restaurant notes:', error); }
  };

  // Menu Restaurant Draft (Brouillon) Functions
  const loadMenuRestaurantDraftSections = async () => {
    try { 
      console.log('[LOAD] Loading menu restaurant draft sections...');
      const data = await apiRequest('/menu-restaurant-draft/sections/list'); 
      console.log('[LOAD] Menu restaurant draft sections loaded:', data?.length || 0, 'sections');
      setMenuRestaurantDraftSections(data || []); 
      return data || [];
    }
    catch (error) { 
      console.error('Error loading menu restaurant draft sections:', error); 
      setMenuRestaurantDraftSections([]);
      return [];
    }
  };

  const loadMenuRestaurantDraftItems = async () => {
    try { 
      console.log('[LOAD] Loading menu restaurant draft items...');
      const data = await apiRequest('/menu-restaurant-draft/items/list'); 
      console.log('[LOAD] Menu restaurant draft items loaded:', data?.length || 0, 'items');
      setMenuRestaurantDraftItems(data || []); 
      return data || [];
    }
    catch (error) { 
      console.error('Error loading menu restaurant draft items:', error); 
      setMenuRestaurantDraftItems([]);
      return [];
    }
  };
  
  // Charger et initialiser automatiquement le brouillon s'il est vide
  const loadAndInitializeDraftIfEmpty = async () => {
    try {
      console.log('[DRAFT] Checking draft status...');
      const sections = await apiRequest('/menu-restaurant-draft/sections/list');
      const items = await apiRequest('/menu-restaurant-draft/items/list');
      
      if ((!sections || sections.length === 0) && (!items || items.length === 0)) {
        console.log('[DRAFT] Draft is empty, initializing from main menu...');
        await apiRequest('/menu-restaurant-draft/initialize', { method: 'POST' });
        // Recharger après initialisation
        const newSections = await apiRequest('/menu-restaurant-draft/sections/list');
        const newItems = await apiRequest('/menu-restaurant-draft/items/list');
        setMenuRestaurantDraftSections(newSections || []);
        setMenuRestaurantDraftItems(newItems || []);
        console.log('[DRAFT] Draft initialized with', newSections?.length || 0, 'sections and', newItems?.length || 0, 'items');
      } else {
        setMenuRestaurantDraftSections(sections || []);
        setMenuRestaurantDraftItems(items || []);
        console.log('[DRAFT] Draft already has data:', sections?.length || 0, 'sections,', items?.length || 0, 'items');
      }
    } catch (error) {
      console.error('[DRAFT] Error loading/initializing draft:', error);
    }
  };

  const publishDraftToMenuRestaurant = async () => {
    try {
      await apiRequest('/menu-restaurant-draft/publish', { method: 'POST' });
      showAlert('Succès', 'Le menu a été mis à jour avec succès !');
      // Recharger les données
      loadMenuRestaurantSections();
      loadMenuRestaurantItems();
      setIsDraftModified(false);
    } catch (error) {
      console.error('Error publishing draft:', error);
      showAlert('Erreur', 'Impossible de publier les modifications');
    }
  };

  const initializeDraftFromMenuRestaurant = async () => {
    try {
      await apiRequest('/menu-restaurant-draft/initialize', { method: 'POST' });
      showAlert('Succès', 'Le brouillon a été initialisé depuis le menu actuel');
      loadMenuRestaurantDraftSections();
      loadMenuRestaurantDraftItems();
    } catch (error) {
      console.error('Error initializing draft:', error);
      showAlert('Erreur', 'Impossible d\'initialiser le brouillon');
    }
  };

  // Events Functions (Module Événements) - REMOVED (app neochef-events)

  // Facturation Functions - REMOVED (app neochef-events)

  // Ardoise Functions (Rapport des ventes)
  const loadArdoiseData = async () => {
    try {
      const data = await apiRequest('/ardoise/by-restaurant/' + restaurant.restaurant_id);
      setArdoiseData(data);
      // Also load report
      loadArdoiseReport();
    } catch (error) { console.error('Error loading ardoise:', error); }
  };

  const loadArdoiseReport = async () => {
    try {
      const data = await apiRequest('/ardoise/sales/report/' + restaurant.restaurant_id + '?period=' + ardoiseReportPeriod);
      setArdoiseReport(data);
    } catch (error) { console.error('Error loading ardoise report:', error); }
  };

  const saveArdoiseSales = async (salesData: any) => {
    try {
      await apiRequest('/ardoise/sales/' + restaurant.restaurant_id, {
        method: 'POST',
        body: JSON.stringify(salesData)
      });
      showAlert('Succès', 'Ventes enregistrées avec succès');
      loadArdoiseReport();
    } catch (error) { 
      console.error('Error saving ardoise sales:', error);
      showAlert('Erreur', 'Erreur lors de l\'enregistrement des ventes');
    }
  };

  const updateArdoise = async (ardoiseUpdate: any) => {
    try {
      await apiRequest('/ardoise/' + restaurant.restaurant_id, {
        method: 'PUT',
        body: JSON.stringify(ardoiseUpdate)
      });
      showAlert('Succès', 'Ardoise mise à jour');
      loadArdoiseData();
    } catch (error) { 
      console.error('Error updating ardoise:', error);
      showAlert('Erreur', 'Erreur lors de la mise à jour');
    }
  };

  // Multi-Restaurant Functions
  const loadMyRestaurants = async (token?: string) => {
    try { 
      console.log('Loading restaurants with token:', token ? 'yes' : 'no');
      const data = await apiRequest('/restaurants/my-restaurants', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      console.log('Restaurants loaded:', data.restaurants?.length || 0);
      setAllRestaurants(data.restaurants || []); 
    }
    catch (error) { console.error('Error loading restaurants:', error); }
  };

  const switchRestaurant = async (restaurantId: string) => {
    try {
      console.log('[SWITCH] Starting switch to restaurant:', restaurantId);
      setIsLoading(true);
      const data = await apiRequest('/restaurants/switch', { method: 'POST', body: JSON.stringify({ restaurant_id: restaurantId }) });
      console.log('[SWITCH] API response:', data.restaurant?.name);
      setUser(data.user);
      setRestaurant(data.restaurant);
      setShowRestaurantPicker(false);
      
      // RESET tous les états pour forcer le rafraîchissement
      console.log('[SWITCH] Resetting all states...');
      setCategories([]);
      setUsers([]);
      setMenuRestaurantSections([]);
      setMenuRestaurantItems([]);
      setMenuRestaurantNotes([]);
      setMenuRestaurantDraftSections([]);
      setMenuRestaurantDraftItems([]);
      setMenuRestaurantDraftNotes([]);
      setFicheSections([]);
      setFicheProducts([]);
      setArdoiseData(null);
      setArdoiseSalesHistory([]);
      setArdoiseReport(null);
      
      // Recharger TOUTES les données du nouveau restaurant
      console.log('[SWITCH] Loading all data for new restaurant...');
      await Promise.all([
        loadCategories(),
        loadUsers(),
        loadMenuRestaurantSections(),
        loadMenuRestaurantItems(),
        loadMenuRestaurantNotes(),
        loadFicheSections(),
        loadFicheProducts(),
      ]);
      
      console.log('[SWITCH] All data loaded, switching to daily screen');
      // Revenir à l'écran principal
      setCurrentScreen('menuRestaurant');
      setIsLoading(false);
      showAlert('Succès', `Vous êtes maintenant sur ${data.restaurant.name}`);
    } catch (error: any) { 
      console.error('[SWITCH] Error:', error);
      setIsLoading(false);
      showAlert('Erreur', error.message); 
    }
  };

  const createNewRestaurant = async () => {
    if (!newRestaurantName.trim()) { showAlert('Erreur', 'Veuillez entrer un nom de restaurant'); return; }
    setIsCreatingRestaurant(true);
    try {
      const data = await apiRequest('/restaurants/create', { 
        method: 'POST', 
        body: JSON.stringify({ name: newRestaurantName.trim(), description: newRestaurantDescription.trim() || null }) 
      });
      // Rafraîchir la liste des restaurants
      await loadMyRestaurants();
      setShowCreateRestaurantModal(false);
      setNewRestaurantName('');
      setNewRestaurantDescription('');
      showAlert('Succès', `Restaurant "${data.restaurant.name}" créé !`);
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsCreatingRestaurant(false); }
  };

  const linkRestaurant = async () => {
    if (!linkRestaurantEmail.trim() || !linkRestaurantPassword.trim()) { 
      setLinkError('Veuillez remplir tous les champs'); 
      return; 
    }
    setIsLinkingRestaurant(true);
    setLinkError('');
    try {
      const data = await apiRequest('/auth/link-restaurant', { 
        method: 'POST', 
        body: JSON.stringify({ 
          restaurant_email: linkRestaurantEmail.trim(), 
          restaurant_password: linkRestaurantPassword 
        }) 
      });
      // Mettre à jour l'utilisateur et le restaurant
      setUser(data.user);
      setRestaurant(data.restaurant);
      // Rafraîchir la liste des restaurants
      await loadMyRestaurants();
      // Charger les données du nouveau restaurant
      await loadCategories();
      await loadUsers();
      // Fermer le modal
      setShowLinkRestaurantModal(false);
      setLinkRestaurantEmail('');
      setLinkRestaurantPassword('');
      showAlert('Succès', data.message);
    } catch (error: any) { 
      setLinkError(error.message || 'Identifiants invalides'); 
    }
    finally { setIsLinkingRestaurant(false); }
  };

  // Délier un restaurant du compte holding
  const unlinkRestaurant = async (restaurantId: string, restaurantName: string) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm(`Voulez-vous délier "${restaurantName}" de votre compte ?`)
      : await new Promise<boolean>((resolve) => {
          showAlert('Délier', `Voulez-vous délier "${restaurantName}" de votre compte ?`, [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Délier', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    
    if (!confirmed) return;
    
    try {
      await apiRequest(`/auth/unlink-restaurant/${restaurantId}`, { method: 'POST' });
      // Rafraîchir la liste des restaurants
      await loadMyRestaurants();
      showAlert('Succès', `"${restaurantName}" a été délié de votre compte`);
    } catch (error: any) {
      showAlert('Erreur', error.message || 'Impossible de délier ce restaurant');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCategories();
    await loadUsers();
    await loadMenuRestaurantSections();
    await loadMenuRestaurantItems();
    setRefreshing(false);
  }, []);

  const handleLogout = async () => {
    try { await apiRequest('/auth/logout', { method: 'POST' }); } catch (error) {}
    await AsyncStorage.removeItem('session_token');
    setSessionToken(null); setUser(null); setRestaurant(null); setCategories([]); setDailyTasks([]); setTaskTemplates([]);
  };

  // Changer mot de passe
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      showAlert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showAlert('Erreur', 'Les nouveaux mots de passe ne correspondent pas');
      return;
    }
    if (newPassword.length < 6) {
      showAlert('Erreur', 'Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    
    setIsChangingPassword(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      showAlert('Succès', 'Mot de passe modifié avec succès');
      setShowChangePasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      showAlert('Erreur', error.message || 'Impossible de modifier le mot de passe');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={secondaryColor} />
          <Text style={[styles.loadingText, { color: secondaryColor }]}>Chargement...</Text>
        </View>
      </SafeAreaWrapper>
    );
  }

  // Si un publicMenuRestaurantId est présent, afficher le menu public (QR code)
  if (publicMenuRestaurantId) {
    return <PublicMenuScreen restaurantId={publicMenuRestaurantId} onClose={() => setPublicMenuRestaurantId(null)} />;
  }

  if (!sessionToken || !user) {
    return <LoginScreen onLogin={async (token, userData, restaurantData) => {
      setSessionToken(token); setUser(userData); setRestaurant(restaurantData);
      // Si c'est un Super Admin, charger les données super admin et afficher l'écran
      if (userData.role === 'superadmin') {
        setCurrentScreen('superadmin');
        // Charger les données immédiatement avec le token
        try {
          const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
          const [restaurants, users, stats] = await Promise.all([
            fetch(`${API_URL}/superadmin/restaurants`, { headers }).then(r => r.json()),
            fetch(`${API_URL}/superadmin/users`, { headers }).then(r => r.json()),
            fetch(`${API_URL}/superadmin/stats`, { headers }).then(r => r.json())
          ]);
          setSuperadminRestaurants(restaurants || []);
          setAllUsersAdmin(users || []);
          setSuperadminStats(stats);
        } catch (error) {
          console.error('Error loading superadmin data:', error);
        }
        return;
      }
      // Ne charger les données que si un restaurant est sélectionné
      if (restaurantData) {
        loadCategories(token); loadUsers(token);
        // Charger les données pour tous les écrans (Fiche Technique, Menu Restaurant)
        loadFicheSections(token); loadFicheProducts(token);
        loadMenuRestaurantSections(token); loadMenuRestaurantItems(token); loadMenuRestaurantNotes(token);
      }
      // Charger les restaurants pour les admins, holdings ET staff avec plusieurs restaurants
      if (userData.role === 'admin' || userData.role === 'holding' || (userData.role === 'staff' && userData.restaurant_ids && userData.restaurant_ids.length > 1)) { 
        loadMyRestaurants(token); 
      }
    }} />;
  }

  // Si Super Admin, afficher l'écran Super Admin sans vérifier le restaurant
  if (user.role === 'superadmin') {
    return (
      <SafeAreaWrapper backgroundColor="#26252D" style={styles.container}>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          <SuperAdminScreen
            restaurants={superadminRestaurants}
            users={allUsersAdmin}
            stats={superadminStats}
            apiRequest={apiRequest}
            loadData={loadSuperadminData}
          />
          {/* Bouton déconnexion */}
          <TouchableOpacity 
            onPress={handleLogout} 
            style={{ position: 'absolute', top: 46, right: 16, padding: 8 }}
          >
            <WebIcon name="log-out-outline" size={24} color="#F5F0E8" />
          </TouchableOpacity>
        </View>
      </SafeAreaWrapper>
    );
  }

  // Si pas de restaurant (compte Holding vide), afficher l'écran d'ajout de restaurant
  if (!restaurant) {
    return (
      <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
        <StatusBar style="light" />
        <View style={[styles.header, { backgroundColor: primaryColor }]} data-testid="app-header">
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: secondaryColor }]}>{user.holding_name || 'Mon Groupe'}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} data-testid="logout-button">
              <WebIcon name="log-out-outline" size={24} color={secondaryColor} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.content, { backgroundColor: secondaryColor }]}>
          <View style={styles.emptyHoldingContainer}>
            <WebIcon name="business-outline" size={80} color={primaryColor} style={{ opacity: 0.5 }} />
            <Text style={[styles.emptyHoldingTitle, { color: primaryColor }]}>Bienvenue, {user.name} !</Text>
            <Text style={[styles.emptyHoldingSubtitle, { color: primaryColor }]}>
              Votre groupe est vide. Ajoutez votre premier restaurant pour commencer.
            </Text>
            <TouchableOpacity 
              style={[styles.addRestaurantButtonLarge, { backgroundColor: primaryColor }]}
              onPress={() => setShowLinkRestaurantModal(true)}
              data-testid="add-restaurant-button"
            >
              <WebIcon name="add-circle-outline" size={24} color={secondaryColor} />
              <Text style={[styles.addRestaurantButtonLargeText, { color: secondaryColor }]}>Ajouter un restaurant</Text>
            </TouchableOpacity>
            <Text style={[styles.emptyHoldingHint, { color: primaryColor, opacity: 0.6 }]}>
              Vous aurez besoin des identifiants (email + mot de passe) du restaurant à ajouter.
            </Text>
          </View>
        </View>
        
        {/* Modal Lier un Restaurant */}
        <Modal visible={showLinkRestaurantModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: primaryColor }]}>Ajouter un restaurant</Text>
                  <TouchableOpacity onPress={() => { setShowLinkRestaurantModal(false); setLinkRestaurantEmail(''); setLinkRestaurantPassword(''); setLinkError(''); }}>
                    <WebIcon name="close" size={28} color={primaryColor} />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalBody}>
                  <Text style={[styles.linkRestaurantHint, { color: primaryColor, opacity: 0.7, marginBottom: 16 }]}>
                    Entrez les identifiants du compte administrateur du restaurant que vous souhaitez ajouter.
                  </Text>
                  <Text style={[styles.inputLabel, { color: primaryColor }]}>Email du restaurant *</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="email@restaurant.com" 
                    value={linkRestaurantEmail} 
                    onChangeText={setLinkRestaurantEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Text style={[styles.inputLabel, { color: primaryColor }]}>Mot de passe *</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="••••••••" 
                    value={linkRestaurantPassword} 
                    onChangeText={setLinkRestaurantPassword}
                    secureTextEntry
                  />
                  {linkError ? <View style={styles.errorContainer}><WebIcon name="alert-circle" size={20} color="#ff4444" /><Text style={styles.errorText}>{linkError}</Text></View> : null}
                  <TouchableOpacity 
                    style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} 
                    onPress={linkRestaurant}
                    disabled={isLinkingRestaurant}
                  >
                    {isLinkingRestaurant ? (
                      <ActivityIndicator color={secondaryColor} />
                    ) : (
                      <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Lier ce restaurant</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaWrapper>
    );
  }

  // Déterminer si on est dans le mode Menu Groupe
  const isOrderPrepMode = false;
  
  // Vérifier si l'utilisateur a accès au Menu Groupe
  const hasMenuGroupeAccess = () => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.menu_groupe === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.menu_groupe?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès aux Tâches
  const hasTachesAccess = () => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.taches !== false) return true; // Par défaut true si non défini
    const dp = (user as any).detailed_permissions;
    if (dp?.taches?.actif === true) return true;
    return true; // Tâches accessible par défaut
  };
  
  // Permissions détaillées pour les tâches
  const canEditTaches = () => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    return dp?.taches?.editer === true;
  };
  
  const canAddTaches = () => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    return dp?.taches?.ajouter === true;
  };
  
  const canDeleteTaches = () => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    return dp?.taches?.supprimer === true;
  };
  
  const canAddTacheModeles = () => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    return dp?.taches?.modeles_ajouter === true;
  };
  
  const canEditTacheModeles = () => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    return dp?.taches?.modeles_modifier === true;
  };
  
  const canDeleteTacheModeles = () => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    return dp?.taches?.modeles_supprimer === true;
  };
  
  // Vérifier si l'utilisateur a accès à Préparation de Commande
  const hasPrepCommandeAccess = () => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.preparation_commande === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.preparation_commande?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès à Fiche Technique
  const hasFicheTechniqueAccess = () => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.fiche_technique === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.fiche_technique?.actif === true) return true;
    return false;
  };
  
  // Obtenir le niveau d'accès à Fiche Technique (pour staff)
  const getFicheTechniqueAccess = (): 'none' | 'bar' | 'cuisine' | 'both' => {
    if (user.role === 'admin') return 'both';
    // Check new detailed_permissions first
    const dp = (user as any).detailed_permissions;
    if (dp?.fiche_technique?.section_access) {
      // Normalize 'tous' to 'both' for compatibility
      const access = dp.fiche_technique.section_access;
      if (access === 'tous' || access === 'all') return 'both';
      return access;
    }
    // If fiche_technique is active but no section_access specified, default to 'both'
    if (dp?.fiche_technique?.actif === true) return 'both';
    // Fallback to old permission system
    return user.permissions?.fiche_technique_access || 'none';
  };
  
  // Vérifier si l'utilisateur peut modifier la Fiche Technique
  const canEditFicheTechnique = (): boolean => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    if (!dp?.fiche_technique) return false;
    // Vérifier si une des permissions de modification est activée
    return dp.fiche_technique.section?.modifier === true || 
           dp.fiche_technique.produits?.modifier === true ||
           dp.fiche_technique.section?.ajouter === true ||
           dp.fiche_technique.produits?.ajouter === true;
  };
  
  // Vérifier si l'utilisateur peut voir une catégorie spécifique dans Fiche Technique
  const canViewFicheCategory = (category: 'bar' | 'cuisine'): boolean => {
    const access = getFicheTechniqueAccess();
    if (access === 'both') return true;
    return access === category;
  };
  
  // Vérifier si l'utilisateur est manager (pour voir les prix)
  const isManager = () => user.role === 'admin';
  
  // Fonction générique pour vérifier les permissions détaillées
  const hasPermission = (path: string): boolean => {
    if (user.role === 'admin') return true;
    
    // Récupérer les permissions détaillées
    const dp = (user as any).detailed_permissions;
    if (!dp) return false;
    
    // Parcourir le chemin (ex: "menu_groupe.section.ajouter")
    const parts = path.split('.');
    let current: any = dp;
    
    for (const part of parts) {
      if (current === undefined || current === null) return false;
      current = current[part];
    }
    
    return current === true;
  };
  
  // Vérifier si un module est actif pour l'utilisateur
  const isModuleActive = (module: string): boolean => {
    if (user.role === 'admin') return true;
    const dp = (user as any).detailed_permissions;
    if (!dp) return false;
    return dp[module]?.actif === true;
  };
  
  // Vérifier si le menu doit être affiché (au moins une permission spéciale)
  const shouldShowMenu = () => {
    // Les admins voient toujours le menu
    if (user.role === 'admin') return true;
    // Les staffs avec au moins une permission voient le menu
    return hasFicheTechniqueAccess() || hasArdoiseAccess() || hasMenuRestaurantAccess() || hasMenuClientAccess() || hasMenuRestaurantDraftAccess();
  };
  
  // Vérifier si l'utilisateur a accès au module Menu Restaurant
  const hasMenuRestaurantAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.menu_restaurant === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.menu_restaurant?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès au module Événements
  const hasEventsAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.events === true || user.permissions?.evenements === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.evenement?.actif === true || dp?.evenements?.actif === true || dp?.events?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès au module Facturation
  const hasFacturationAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.facturation === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.facturation?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur peut accéder à plusieurs restaurants
  const canSwitchRestaurant = (): boolean => {
    if (user.role === 'admin') return true;
    // Staff avec plusieurs restaurants
    const userRestaurantIds = (user as any).restaurant_ids || [];
    return userRestaurantIds.length > 1;
  };
  
  // Vérifier si l'utilisateur a accès au module Prestataires
  const hasPrestatairesAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.prestataires === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.prestataires?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès au module Menu Client
  const hasMenuClientAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Permission individuelle - uniquement menu_client
    if (user.permissions?.menu_client === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.menu_client?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès au module Menu Restaurant en cours (Brouillon)
  const hasMenuRestaurantDraftAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Permission individuelle - uniquement menu_restaurant_en_cours
    if (user.permissions?.menu_restaurant_en_cours === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.menu_restaurant_en_cours?.actif === true) return true;
    return false;
  };
  
  // Vérifier si l'utilisateur a accès au module Ardoise
  const hasArdoiseAccess = (): boolean => {
    if (user.role === 'admin') return true;
    // Check both old and new permission systems
    if (user.permissions?.ardoise === true) return true;
    const dp = (user as any).detailed_permissions;
    if (dp?.ardoise?.actif === true) return true;
    return false;
  };
  
  // Obtenir les permissions Ardoise détaillées
  const getArdoisePermissions = () => {
    if (user.role === 'admin') {
      return {
        actif: true,
        edition: { acces: true, mode: 'modifier' },
        ventes: { acces: true, mode: 'modifier' },
        rapports: { acces: true, mode: 'modifier', export_pdf: true, export_excel: true }
      };
    }
    const dp = (user as any).detailed_permissions;
    if (!dp || !dp.ardoise) {
      return {
        actif: false,
        edition: { acces: false, mode: 'lecture' },
        ventes: { acces: false, mode: 'lecture' },
        rapports: { acces: false, mode: 'lecture', export_pdf: false, export_excel: false }
      };
    }
    return {
      actif: dp.ardoise.actif || false,
      edition: dp.ardoise.edition || { acces: false, mode: 'lecture' },
      ventes: dp.ardoise.ventes || { acces: false, mode: 'lecture' },
      rapports: dp.ardoise.rapports || { acces: false, mode: 'lecture', export_pdf: false, export_excel: false }
    };
  };

  return (
    <SafeAreaWrapper 
      backgroundColor={primaryColor} 
      bottomBackgroundColor={(currentScreen === 'ficheTechnique' || currentScreen === 'menuRestaurant' || currentScreen === 'menuRestaurantDraft' || currentScreen === 'rapportArdoise') ? secondaryColor : undefined}
      style={styles.container}
    >
      <StatusBar style="light" />
      
      {/* Notification de mise à jour PWA */}
      <UpdateNotification />
      
      <View style={[styles.header, { backgroundColor: primaryColor }]} data-testid="app-header">
        {/* LEFT: Menu hamburger (juste 3 barres) */}
        <View style={styles.headerLeft}>
          {shouldShowMenu() && (
            <TouchableOpacity 
              onPress={() => setShowManagerMenu(!showManagerMenu)} 
              style={styles.headerIconButton}
              data-testid="manager-menu-button"
            >
              <WebIcon name="menu" size={28} color={secondaryColor} />
            </TouchableOpacity>
          )}
        </View>

        {/* CENTER: Logo centré */}
        <View style={styles.headerCenter}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', padding: 5 }}
            onPress={() => {
              console.log('[RESTAURANT_PICKER] Click detected, canSwitch:', canSwitchRestaurant());
              if (canSwitchRestaurant()) {
                console.log('[RESTAURANT_PICKER] Opening picker');
                setShowRestaurantPicker(true);
              }
            }}
            activeOpacity={0.7}
          >
            {restaurant?.logo_base64 ? (
              <Image source={{ uri: `data:image/png;base64,${restaurant.logo_base64}` }} style={styles.headerLogo} resizeMode="contain" />
            ) : (
              <Text style={[styles.headerTitle, { color: secondaryColor }]}>{restaurant?.name || 'NeoChef'}</Text>
            )}
            {canSwitchRestaurant() && (
              <View style={{ marginLeft: 8, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: secondaryColor, fontWeight: 'bold' }}>v</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* RIGHT: bouton Paramètres retiré — remplacé par la tuile Paramètres sur la landing */}
        <View style={styles.headerRight} />
      </View>

      {/* Settings Dropdown Menu */}
      {showSettingsDropdown && (
        <View style={[styles.settingsDropdown, { backgroundColor: primaryColor, borderColor: secondaryColor }]} data-testid="settings-dropdown-menu">
          <View style={styles.settingsDropdownHeader}>
            <Text style={[styles.settingsDropdownName, { color: secondaryColor }]}>{user.name}</Text>
            <Text style={[styles.settingsDropdownRole, { color: secondaryColor }]}>{user.role === 'admin' ? 'Manager' : 'Staff'}</Text>
          </View>
          {user.role === 'admin' && (
            <>
              <TouchableOpacity 
                style={styles.settingsDropdownItem} 
                onPress={() => { setShowSettingsDropdown(false); setCurrentScreen('settings'); }}
              >
                <WebIcon name="cog-outline" size={20} color={secondaryColor} />
                <Text style={[styles.settingsDropdownText, { color: secondaryColor }]}>Paramètres</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.settingsDropdownItem} 
                onPress={() => { setShowSettingsDropdown(false); setCurrentScreen('users'); loadUsers(); }}
              >
                <WebIcon name="people-outline" size={20} color={secondaryColor} />
                <Text style={[styles.settingsDropdownText, { color: secondaryColor }]}>Équipe</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={styles.settingsDropdownDivider} />
          <TouchableOpacity 
            style={styles.settingsDropdownItem} 
            onPress={() => { setShowSettingsDropdown(false); setShowChangePasswordModal(true); }}
            data-testid="change-password-btn"
          >
            <WebIcon name="key-outline" size={20} color={secondaryColor} />
            <Text style={[styles.settingsDropdownText, { color: secondaryColor }]}>Modifier mot de passe</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.settingsDropdownItem} 
            onPress={() => { setShowSettingsDropdown(false); handleLogout(); }}
          >
            <WebIcon name="log-out-outline" size={20} color="#ff6b6b" />
            <Text style={[styles.settingsDropdownText, { color: '#ff6b6b' }]}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Menu déroulant - positionné à gauche */}
      {showManagerMenu && shouldShowMenu() && (
        <View style={[styles.managerMenuLeft, { backgroundColor: primaryColor, borderColor: secondaryColor }]} data-testid="manager-menu-dropdown">
          {/* Option Menu Restaurant - visible pour admins et staff avec permission menu_restaurant */}
          {(user.role === 'admin' || hasMenuRestaurantAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('menuRestaurant'); loadMenuRestaurantSections(); loadMenuRestaurantItems(); loadMenuRestaurantNotes(); loadFicheProducts(); }}
              data-testid="menu-item-menu-restaurant"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>🍽️</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Menu Restaurant</Text>
            </TouchableOpacity>
          )}
          {/* Option Menu Restaurant en cours (brouillon) - visible pour admins et staff avec permission menu_restaurant_en_cours */}
          {(user.role === 'admin' || hasMenuRestaurantDraftAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('menuRestaurantDraft'); loadAndInitializeDraftIfEmpty(); }}
              data-testid="menu-item-menu-restaurant-draft"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>✏️</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Menu Restaurant en cours</Text>
            </TouchableOpacity>
          )}
          {/* Option Menu Client - visible pour admins et staff avec permission menu_client ou menu_restaurant */}
          {(user.role === 'admin' || hasMenuClientAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { 
                setShowManagerMenu(false); 
                const clientUrl = `${API_URL.replace('/api', '')}/client/${restaurant?.share_token || restaurant?.restaurant_id}`;
                if (Platform.OS === 'web') {
                  window.open(clientUrl, '_blank');
                }
              }}
              data-testid="menu-item-menu-client"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>👁️</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Menu Client</Text>
            </TouchableOpacity>
          )}
          {/* Option Fiche Technique - visible pour admins et staff avec permission fiche_technique */}
          {hasFicheTechniqueAccess() && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('ficheTechnique'); loadFicheSections(); loadFicheProducts(); }}
              data-testid="menu-item-fiche-technique"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>📋</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Fiche Technique</Text>
            </TouchableOpacity>
          )}
          {/* Option Rapport Ardoise - visible pour admins et staff avec permission ardoise */}
          {(user.role === 'admin' || hasArdoiseAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('rapportArdoise'); loadArdoiseData(); }}
              data-testid="menu-item-rapport-ardoise"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>📊</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Rapport Ardoise</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[
        styles.content, 
        { backgroundColor: secondaryColor },
        // Étendre jusqu'en bas (pas de barre de navigation)
        { 
          borderBottomLeftRadius: 0, 
          borderBottomRightRadius: 0,
          paddingBottom: 0
        }
      ]} data-testid="main-content">
        {currentScreen === 'users' && user.role === 'admin' && (
          <UsersScreen key={`users-${restaurant?.restaurant_id}`} users={users} categories={categories} primaryColor={primaryColor}
            secondaryColor={secondaryColor} apiRequest={apiRequest} loadUsers={() => loadUsers()} allRestaurants={allRestaurants} />
        )}
        {currentScreen === 'superadmin' && user.role === 'superadmin' && (
          <SuperAdminScreen
            restaurants={superadminRestaurants}
            users={allUsersAdmin}
            stats={superadminStats}
            apiRequest={apiRequest}
            loadData={loadSuperadminData}
          />
        )}
        {currentScreen === 'settings' && user.role === 'admin' && (
          <SettingsScreen key={`settings-${restaurant?.restaurant_id}`} restaurant={restaurant!} primaryColor={primaryColor} secondaryColor={secondaryColor}
            apiRequest={apiRequest} onUpdate={(r) => setRestaurant(r)} 
            onNavigateToCategories={() => setCurrentScreen('categories')}
            onNavigateToUsers={() => { setCurrentScreen('users'); loadUsers(); }}
            currentUser={user} />
        )}
        {currentScreen === 'ficheTechnique' && hasFicheTechniqueAccess() && (
          <FicheTechniqueScreen
            key={`ficheTechnique-${restaurant?.restaurant_id}`}
            sections={ficheSections}
            products={ficheProducts}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            apiRequest={apiRequest}
            loadSections={loadFicheSections}
            loadProducts={loadFicheProducts}
            sessionToken={sessionToken}
            setCurrentScreen={setCurrentScreen}
            isManager={isManager()}
            userFicheTechniqueAccess={getFicheTechniqueAccess()}
            userFichePermissions={user?.detailed_permissions?.fiche_technique || {}}
          />
        )}
        {currentScreen === 'menuRestaurant' && hasMenuRestaurantAccess() && (
          <MenuRestaurantScreen
            key={`menuRestaurant-${restaurant?.restaurant_id}`}
            sections={menuRestaurantSections}
            items={menuRestaurantItems}
            notes={menuRestaurantNotes}
            ficheProducts={ficheProducts}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            apiRequest={apiRequest}
            loadSections={loadMenuRestaurantSections}
            loadItems={loadMenuRestaurantItems}
            loadNotes={loadMenuRestaurantNotes}
            loadFicheProducts={loadFicheProducts}
            setCurrentScreen={setCurrentScreen}
            sessionToken={sessionToken}
            isDraftMode={false}
            userPermissions={
              // Menu Restaurant final = lecture seule pour staff, même avec permissions
              // Seul l'admin peut modifier le menu final
              user?.role === 'admin' 
                ? (user?.detailed_permissions?.menu_restaurant || {})
                : { actif: true } // Staff = lecture seule (pas de boutons d'édition)
            }
            isAdmin={user?.role === 'admin'}
          />
        )}
        {currentScreen === 'menuRestaurantDraft' && hasMenuRestaurantDraftAccess() && (
          <View style={{ flex: 1 }}>
            {/* Header avec titre et boutons */}
            <View style={{ backgroundColor: primaryColor, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>Menu en cours</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity 
                  onPress={async () => {
                    try {
                      const confirmed = await showConfirm('Régénérer les traductions du menu ?\n\nCette opération peut prendre quelques minutes.');
                      if (!confirmed) return;
                      
                      const response = await fetch(`${API_BASE_URL}/api/public/translations/${restaurant?.restaurant_id}/generate`, {
                        method: 'POST'
                      });
                      
                      if (response.ok) {
                        alert('✅ Traductions régénérées avec succès !');
                      } else {
                        const error = await response.json();
                        alert('❌ Erreur: ' + (error.detail || 'Échec de la régénération'));
                      }
                    } catch (err: any) {
                      alert('❌ Erreur: ' + err.message);
                    }
                  }}
                  style={{ backgroundColor: '#9C27B0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  data-testid="regenerate-translations-btn"
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>🌐 Traduire</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={publishDraftToMenuRestaurant}
                  style={{ backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>📤 Publier</Text>
                </TouchableOpacity>
              </View>
            </View>
            <MenuRestaurantScreen
              key={`menuRestaurantDraft-${restaurant?.restaurant_id}`}
              sections={menuRestaurantDraftSections}
              items={menuRestaurantDraftItems}
              notes={menuRestaurantNotes}
              ficheProducts={ficheProducts}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              apiRequest={apiRequest}
              loadSections={loadMenuRestaurantDraftSections}
              loadItems={loadMenuRestaurantDraftItems}
              loadNotes={loadMenuRestaurantNotes}
              loadFicheProducts={loadFicheProducts}
              setCurrentScreen={setCurrentScreen}
              sessionToken={sessionToken}
              isDraftMode={true}
              userPermissions={
                // Pour Menu en cours: si actif, donner les permissions d'édition complètes par défaut
                user?.detailed_permissions?.menu_restaurant_en_cours?.actif 
                  ? { 
                      actif: true, 
                      section: { ajouter: true, modifier: true, supprimer: true },
                      produits: { ajouter: true, modifier: true, supprimer: true },
                      note: true,
                      export_pdf: true,
                      export_csv: true
                    }
                  : user?.detailed_permissions?.menu_restaurant || {}
              }
              isAdmin={user?.role === 'admin'}
            />
          </View>
        )}
        {currentScreen === 'rapportArdoise' && (user.role === 'admin' || hasArdoiseAccess()) && (
          <RapportArdoiseScreen
            key={`rapport-ardoise-${restaurant?.restaurant_id}`}
            ardoiseData={ardoiseData}
            ardoiseReport={ardoiseReport}
            ardoiseReportPeriod={ardoiseReportPeriod}
            setArdoiseReportPeriod={setArdoiseReportPeriod}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            apiRequest={apiRequest}
            loadArdoiseData={loadArdoiseData}
            loadArdoiseReport={loadArdoiseReport}
            saveArdoiseSales={saveArdoiseSales}
            updateArdoise={updateArdoise}
            restaurant={restaurant}
            showAlert={showAlert}
            ardoisePermissions={getArdoisePermissions()}
            onBack={() => setCurrentScreen('menuRestaurant')}
          />
        )}
      </View>


      {/* Modal Sélecteur de Restaurant */}
      <Modal visible={showRestaurantPicker} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 350 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryColor }]}>Mes restaurants</Text>
              <TouchableOpacity onPress={() => setShowRestaurantPicker(false)}>
                <WebIcon name="close" size={28} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {allRestaurants.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: primaryColor, opacity: 0.6 }}>Aucun restaurant lié</Text>
                </View>
              ) : (
                allRestaurants.map((rest) => (
                  <View key={rest.restaurant_id} style={[
                    styles.restaurantPickerItem, 
                    rest.restaurant_id === restaurant?.restaurant_id && { backgroundColor: `${primaryColor}15` }
                  ]}>
                    <TouchableOpacity 
                      style={{ flex: 1 }}
                      onPress={() => switchRestaurant(rest.restaurant_id)}
                    >
                      <Text style={[styles.restaurantPickerName, { color: primaryColor }]}>{rest.name}</Text>
                      {rest.description && <Text style={styles.restaurantPickerDesc}>{rest.description}</Text>}
                    </TouchableOpacity>
                    {rest.restaurant_id === restaurant?.restaurant_id ? (
                      <WebIcon name="checkmark-circle" size={24} color={primaryColor} />
                    ) : (
                      <TouchableOpacity 
                        onPress={() => unlinkRestaurant(rest.restaurant_id, rest.name)}
                        style={{ padding: 8 }}
                        data-testid={`unlink-restaurant-${rest.restaurant_id}`}
                      >
                        <WebIcon name="close-circle-outline" size={22} color="#ff4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
            
            {/* Section séparée pour les actions Holding */}
            <View style={{ borderTopWidth: 1, borderTopColor: `${primaryColor}20`, paddingTop: 12, marginTop: 8 }}>
              <TouchableOpacity 
                style={[styles.addRestaurantButton, { borderColor: primaryColor, marginBottom: 8 }]}
                onPress={() => { setShowRestaurantPicker(false); setShowLinkRestaurantModal(true); }}
              >
                <WebIcon name="link-outline" size={20} color={primaryColor} />
                <Text style={[styles.addRestaurantButtonText, { color: primaryColor }]}>Lier un restaurant existant</Text>
              </TouchableOpacity>
              
              {/* Bouton Gestion Holding - Admin uniquement */}
              {user.role === 'admin' && (
                <TouchableOpacity 
                  style={[styles.addRestaurantButton, { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }]}
                  onPress={() => { setShowRestaurantPicker(false); setShowHoldingManagement(true); }}
                  data-testid="holding-management-btn"
                >
                  <WebIcon name="business-outline" size={20} color={primaryColor} />
                  <Text style={[styles.addRestaurantButtonText, { color: primaryColor }]}>Gestion Holding</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Gestion Holding */}
      <Modal visible={showHoldingManagement} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryColor }]}>Gestion Holding</Text>
              <TouchableOpacity onPress={() => setShowHoldingManagement(false)}>
                <WebIcon name="close" size={28} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {/* Créer un nouveau restaurant */}
              <TouchableOpacity 
                style={[styles.holdingActionButton, { borderColor: primaryColor }]}
                onPress={() => { setShowHoldingManagement(false); setShowCreateRestaurantModal(true); }}
                data-testid="create-restaurant-btn"
              >
                <WebIcon name="storefront-outline" size={28} color={primaryColor} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.holdingActionTitle, { color: primaryColor }]}>Créer un restaurant</Text>
                  <Text style={[styles.holdingActionSubtitle, { color: primaryColor, opacity: 0.6 }]}>Ajouter un nouveau restaurant au holding</Text>
                </View>
              </TouchableOpacity>
              
              {/* Créer un compte holding */}
              <TouchableOpacity 
                style={[styles.holdingActionButton, { borderColor: primaryColor, marginTop: 12 }]}
                onPress={() => { setShowHoldingManagement(false); setShowCreateHoldingModal(true); }}
                data-testid="create-holding-btn"
              >
                <WebIcon name="people-outline" size={28} color={primaryColor} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.holdingActionTitle, { color: primaryColor }]}>Créer un compte Holding</Text>
                  <Text style={[styles.holdingActionSubtitle, { color: primaryColor, opacity: 0.6 }]}>Nouveau compte avec accès multi-restaurants</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Lier un Restaurant */}
      <Modal visible={showLinkRestaurantModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Lier un restaurant</Text>
                <TouchableOpacity onPress={() => { setShowLinkRestaurantModal(false); setLinkRestaurantEmail(''); setLinkRestaurantPassword(''); setLinkError(''); }}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.linkRestaurantHint, { color: primaryColor, opacity: 0.7, marginBottom: 16 }]}>
                  Entrez les identifiants du compte administrateur du restaurant à ajouter.
                </Text>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Email du restaurant *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="email@restaurant.com" 
                  value={linkRestaurantEmail} 
                  onChangeText={setLinkRestaurantEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Mot de passe *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="••••••••" 
                  value={linkRestaurantPassword} 
                  onChangeText={setLinkRestaurantPassword}
                  secureTextEntry
                />
                {linkError ? <View style={styles.errorContainer}><WebIcon name="alert-circle" size={20} color="#ff4444" /><Text style={styles.errorText}>{linkError}</Text></View> : null}
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} 
                  onPress={linkRestaurant}
                  disabled={isLinkingRestaurant}
                >
                  {isLinkingRestaurant ? (
                    <ActivityIndicator color={secondaryColor} />
                  ) : (
                    <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Lier ce restaurant</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal Créer un Restaurant (depuis Holding) */}
      <Modal visible={showCreateRestaurantModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Créer un restaurant</Text>
                <TouchableOpacity onPress={() => { setShowCreateRestaurantModal(false); setNewRestaurantName(''); setNewRestaurantDescription(''); }}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom du restaurant *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="Nom du restaurant" 
                  value={newRestaurantName} 
                  onChangeText={setNewRestaurantName}
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Description</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor, height: 80, textAlignVertical: 'top' }]} 
                  placeholder="Description du restaurant (optionnel)" 
                  value={newRestaurantDescription} 
                  onChangeText={setNewRestaurantDescription}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} 
                  onPress={async () => {
                    if (!newRestaurantName.trim()) { showAlert('Erreur', 'Veuillez entrer un nom'); return; }
                    setIsCreatingRestaurant(true);
                    try {
                      const data = await apiRequest('/restaurants/create-for-holding', { 
                        method: 'POST', 
                        body: JSON.stringify({ name: newRestaurantName.trim(), description: newRestaurantDescription.trim() }) 
                      });
                      await loadMyRestaurants();
                      setShowCreateRestaurantModal(false);
                      setNewRestaurantName('');
                      setNewRestaurantDescription('');
                      showAlert('Succès', `Restaurant "${data.restaurant.name}" créé avec succès !`);
                    } catch (error: any) { showAlert('Erreur', error.message || 'Erreur lors de la création'); }
                    finally { setIsCreatingRestaurant(false); }
                  }}
                  disabled={isCreatingRestaurant}
                  data-testid="submit-create-restaurant"
                >
                  {isCreatingRestaurant ? (
                    <ActivityIndicator color={secondaryColor} />
                  ) : (
                    <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Créer le restaurant</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal Créer un Compte Holding */}
      <Modal visible={showCreateHoldingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Créer un compte Holding</Text>
                <TouchableOpacity onPress={() => { setShowCreateHoldingModal(false); setNewHoldingName(''); setNewHoldingEmail(''); setNewHoldingPassword(''); }}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.linkRestaurantHint, { color: primaryColor, opacity: 0.7, marginBottom: 16 }]}>
                  Un compte Holding permet de gérer plusieurs restaurants depuis un seul compte.
                </Text>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom du holding *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="Ex: Groupe Restaurant XYZ" 
                  value={newHoldingName} 
                  onChangeText={setNewHoldingName}
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Email *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="holding@exemple.com" 
                  value={newHoldingEmail} 
                  onChangeText={setNewHoldingEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Mot de passe *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="••••••••" 
                  value={newHoldingPassword} 
                  onChangeText={setNewHoldingPassword}
                  secureTextEntry
                />
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} 
                  onPress={async () => {
                    if (!newHoldingName.trim() || !newHoldingEmail.trim() || !newHoldingPassword) { 
                      showAlert('Erreur', 'Veuillez remplir tous les champs'); 
                      return; 
                    }
                    setIsCreatingHolding(true);
                    try {
                      await apiRequest('/auth/create-holding', { 
                        method: 'POST', 
                        body: JSON.stringify({ 
                          name: newHoldingName.trim(), 
                          email: newHoldingEmail.trim().toLowerCase(),
                          password: newHoldingPassword
                        }) 
                      });
                      setShowCreateHoldingModal(false);
                      setNewHoldingName('');
                      setNewHoldingEmail('');
                      setNewHoldingPassword('');
                      showAlert('Succès', 'Compte Holding créé avec succès ! Le nouveau compte peut maintenant se connecter.');
                    } catch (error: any) { showAlert('Erreur', error.message || 'Erreur lors de la création'); }
                    finally { setIsCreatingHolding(false); }
                  }}
                  disabled={isCreatingHolding}
                  data-testid="submit-create-holding"
                >
                  {isCreatingHolding ? (
                    <ActivityIndicator color={secondaryColor} />
                  ) : (
                    <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Créer le compte</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal Changer Mot de Passe */}
      <Modal visible={showChangePasswordModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Modifier mot de passe</Text>
                <TouchableOpacity onPress={() => { setShowChangePasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); }}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Mot de passe actuel *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="••••••••" 
                  value={currentPassword} 
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nouveau mot de passe *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="••••••••" 
                  value={newPassword} 
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Confirmer le nouveau mot de passe *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="••••••••" 
                  value={confirmNewPassword} 
                  onChangeText={setConfirmNewPassword}
                  secureTextEntry
                />
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 20 }]} 
                  onPress={handleChangePassword}
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? (
                    <ActivityIndicator color={secondaryColor} />
                  ) : (
                    <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Modifier</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal Créer un Restaurant */}
      <Modal visible={showCreateRestaurantModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Nouveau restaurant</Text>
                <TouchableOpacity onPress={() => { setShowCreateRestaurantModal(false); setNewRestaurantName(''); setNewRestaurantDescription(''); }}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom du restaurant *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="Ex: Le Parloir" 
                  value={newRestaurantName} 
                  onChangeText={setNewRestaurantName}
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Description (optionnel)</Text>
                <TextInput 
                  style={[styles.modalInput, styles.modalInputMultiline, { borderColor: primaryColor }]} 
                  placeholder="Ex: Restaurant gastronomique" 
                  value={newRestaurantDescription} 
                  onChangeText={setNewRestaurantDescription}
                  multiline
                  numberOfLines={2}
                />
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} 
                  onPress={createNewRestaurant}
                  disabled={isCreatingRestaurant}
                >
                  {isCreatingRestaurant ? (
                    <ActivityIndicator color={secondaryColor} />
                  ) : (
                    <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Créer le restaurant</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaWrapper>
  );
}

// ==================== LOGIN SCREEN ====================
function LoginScreen({ onLogin }: { onLogin: (token: string, user: User, restaurant: Restaurant | null) => void }) {
  const [mode, setMode] = useState<'select' | 'login' | 'register' | 'register-holding' | 'forgot' | 'reset'>('select');
  const [loginType, setLoginType] = useState<'admin' | 'staff'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [holdingName, setHoldingName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Cached restaurant branding for login screen
  const [cachedBranding, setCachedBranding] = useState<{
    name: string;
    description: string;
    logo_base64: string | null;
    primary_color: string;
    secondary_color: string;
  } | null>(null);

  // Load cached branding on mount
  useEffect(() => {
    const loadCachedBranding = async () => {
      try {
        const cached = await AsyncStorage.getItem('restaurant_branding');
        if (cached) {
          setCachedBranding(JSON.parse(cached));
        }
      } catch (error) {
        console.error('Error loading cached branding:', error);
      }
    };
    loadCachedBranding();
  }, []);

  // Check for reset token in URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('reset_token');
      if (token) {
        setResetToken(token);
        setMode('reset');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Get display values (cached or default) - NeoChef branding par défaut
  const displayName = cachedBranding?.name || 'NeoChef';
  const displayDescription = cachedBranding?.description || 'Gestion intelligente de restaurant';
  const displayLogo = cachedBranding?.logo_base64;
  const displayPrimary = cachedBranding?.primary_color || DEFAULT_PRIMARY;
  const displaySecondary = cachedBranding?.secondary_color || DEFAULT_SECONDARY;

  const handleLogin = async () => {
    if (!email || !password) { setError('Veuillez remplir tous les champs'); return; }
    setIsLoading(true); setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!response.ok) { const err = await response.json(); throw new Error(err.detail || 'Identifiants invalides'); }
      const data = await response.json();
      await AsyncStorage.setItem('session_token', data.session_token);
      // Cache restaurant branding for next login screen display
      if (data.restaurant) {
        await AsyncStorage.setItem('restaurant_branding', JSON.stringify({
          name: data.restaurant.name,
          description: data.restaurant.description || 'Gestion des tâches cuisine',
          logo_base64: data.restaurant.logo_base64,
          primary_color: data.restaurant.primary_color,
          secondary_color: data.restaurant.secondary_color
        }));
      }
      onLogin(data.session_token, data.user, data.restaurant);
    } catch (err: any) { setError(err.message || 'Erreur de connexion'); }
    finally { setIsLoading(false); }
  };

  const handleRegister = async () => {
    if (!email || !password || !name || !restaurantName) { setError('Veuillez remplir tous les champs'); return; }
    setIsLoading(true); setError('');
    try {
      const response = await fetch(`${API_URL}/auth/register-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name, restaurant_name: restaurantName }) });
      if (!response.ok) { const err = await response.json(); throw new Error(err.detail || 'Erreur d\'inscription'); }
      const data = await response.json();
      await AsyncStorage.setItem('session_token', data.session_token);
      // Cache restaurant branding for next login screen display
      if (data.restaurant) {
        await AsyncStorage.setItem('restaurant_branding', JSON.stringify({
          name: data.restaurant.name,
          description: data.restaurant.description || 'Gestion des tâches cuisine',
          logo_base64: data.restaurant.logo_base64,
          primary_color: data.restaurant.primary_color,
          secondary_color: data.restaurant.secondary_color
        }));
      }
      onLogin(data.session_token, data.user, data.restaurant);
    } catch (err: any) { setError(err.message || 'Erreur d\'inscription'); }
    finally { setIsLoading(false); }
  };

  const handleRegisterHolding = async () => {
    if (!email || !password || !name) { setError('Veuillez remplir tous les champs obligatoires'); return; }
    setIsLoading(true); setError('');
    try {
      const response = await fetch(`${API_URL}/auth/register-holding`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email, password, name, holding_name: holdingName || null }) 
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err.detail || 'Erreur d\'inscription'); }
      const data = await response.json();
      await AsyncStorage.setItem('session_token', data.session_token);
      onLogin(data.session_token, data.user, null);
    } catch (err: any) { setError(err.message || 'Erreur d\'inscription'); }
    finally { setIsLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError('Veuillez entrer votre adresse email'); return; }
    setIsLoading(true); setError(''); setSuccessMessage('');
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email }) 
      });
      const data = await response.json();
      setSuccessMessage(data.message || 'Un email de réinitialisation a été envoyé si le compte existe.');
    } catch (err: any) { 
      setSuccessMessage('Un email de réinitialisation a été envoyé si le compte existe.');
    }
    finally { setIsLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) { setError('Veuillez remplir tous les champs'); return; }
    if (newPassword !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    if (newPassword.length < 4) { setError('Le mot de passe doit contenir au moins 4 caractères'); return; }
    
    setIsLoading(true); setError(''); setSuccessMessage('');
    try {
      const response = await fetch(`${API_URL}/auth/reset-password-with-token`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ token: resetToken, new_password: newPassword }) 
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err.detail || 'Erreur'); }
      const data = await response.json();
      setSuccessMessage(data.message || 'Mot de passe réinitialisé avec succès !');
      setTimeout(() => { setMode('select'); setResetToken(''); setNewPassword(''); setConfirmPassword(''); }, 2000);
    } catch (err: any) { setError(err.message || 'Erreur lors de la réinitialisation'); }
    finally { setIsLoading(false); }
  };

  if (mode === 'select') {
    return (
      <SafeAreaWrapper backgroundColor={'#1a1a2e'} style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loginContainer}>
          <View style={styles.logoSection}>
            {/* Toujours afficher le logo NeoChef sur l'écran d'accueil */}
            <Image source={require('../assets/images/logo.png')} style={{ width: 180, height: 180, borderRadius: 24 }} resizeMode="contain" />
          </View>
          <View style={styles.buttonSection}>
            <TouchableOpacity style={[styles.accessButton, { backgroundColor: '#00d4ff' }]} onPress={() => { setMode('login'); }} data-testid="login-button">
              <WebIcon name="log-in-outline" size={28} color="#1a1a2e" />
              <Text style={[styles.accessButtonText, { color: '#1a1a2e' }]}>Connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.accessButton, { backgroundColor: '#EAE6CA', marginTop: 12 }]} onPress={() => { setMode('register'); }} data-testid="register-restaurant-button">
              <WebIcon name="restaurant-outline" size={28} color="#1a1a2e" />
              <Text style={[styles.accessButtonText, { color: '#1a1a2e' }]}>Créer un restaurant</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.accessButton, { backgroundColor: '#EAE6CA', marginTop: 12 }]} onPress={() => { setMode('register-holding'); }} data-testid="register-holding-button">
              <WebIcon name="business-outline" size={28} color="#1a1a2e" />
              <Text style={[styles.accessButtonText, { color: '#1a1a2e' }]}>Créer un groupe (Holding)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaWrapper>
    );
  }

  // Register Holding screen
  if (mode === 'register-holding') {
    return (
      <SafeAreaWrapper backgroundColor={DEFAULT_PRIMARY} style={styles.container}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => { setMode('select'); setError(''); setEmail(''); setPassword(''); setName(''); setHoldingName(''); }}>
              <WebIcon name="arrow-back" size={24} color={DEFAULT_SECONDARY} />
              <Text style={[styles.backText, { color: DEFAULT_SECONDARY }]}>Retour</Text>
            </TouchableOpacity>
            <View style={styles.formHeader}>
              <WebIcon name="business" size={60} color={DEFAULT_SECONDARY} />
              <Text style={[styles.formTitle, { color: DEFAULT_SECONDARY }]}>Créer un Groupe</Text>
              <Text style={[styles.formSubtitle, { color: DEFAULT_SECONDARY, opacity: 0.8, marginTop: 8 }]}>
                Un compte groupe vous permet de gérer plusieurs restaurants depuis un seul compte.
              </Text>
            </View>
            <View style={styles.formContainer}>
              <View style={styles.inputContainer}>
                <WebIcon name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Votre nom *" placeholderTextColor="#666" value={name} onChangeText={setName} />
              </View>
              <View style={styles.inputContainer}>
                <WebIcon name="business-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Nom du groupe (optionnel)" placeholderTextColor="#666" value={holdingName} onChangeText={setHoldingName} />
              </View>
              <View style={styles.inputContainer}>
                <WebIcon name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Email *" placeholderTextColor="#666" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={styles.inputContainer}>
                <WebIcon name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput 
                  style={[styles.input, Platform.OS === 'web' ? { WebkitTextSecurity: 'disc' } : {}]} 
                  placeholder="Mot de passe *" 
                  placeholderTextColor="#666" 
                  value={password} 
                  onChangeText={setPassword} 
                  secureTextEntry={Platform.OS !== 'web'}
                  autoComplete="off"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="none"
                  autoCapitalize="none"
                />
              </View>
              {error ? <View style={styles.errorContainer}><WebIcon name="alert-circle" size={20} color="#ff4444" /><Text style={styles.errorText}>{error}</Text></View> : null}
              <TouchableOpacity style={[styles.submitButton, { backgroundColor: DEFAULT_SECONDARY }]} onPress={handleRegisterHolding} disabled={isLoading} data-testid="submit-holding-button">
                {isLoading ? <ActivityIndicator color={DEFAULT_PRIMARY} /> : <Text style={[styles.submitButtonText, { color: DEFAULT_PRIMARY }]}>Créer mon groupe</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaWrapper>
    );
  }

  // Forgot password screen
  if (mode === 'forgot') {
    return (
      <SafeAreaWrapper backgroundColor={DEFAULT_PRIMARY} style={styles.container}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => { setMode('login'); setError(''); setSuccessMessage(''); }}>
              <WebIcon name="arrow-back" size={24} color={DEFAULT_SECONDARY} />
              <Text style={[styles.backText, { color: DEFAULT_SECONDARY }]}>Retour</Text>
            </TouchableOpacity>
            <View style={styles.formHeader}>
              <WebIcon name="mail-outline" size={60} color={DEFAULT_SECONDARY} />
              <Text style={[styles.formTitle, { color: DEFAULT_SECONDARY }]}>Mot de passe oublié</Text>
            </View>
            <View style={styles.formContainer}>
              <Text style={[styles.forgotText, { color: DEFAULT_SECONDARY }]}>
                Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
              </Text>
              <View style={styles.inputContainer}>
                <WebIcon name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#666" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
              {error ? <View style={styles.errorContainer}><WebIcon name="alert-circle" size={20} color="#ff4444" /><Text style={styles.errorText}>{error}</Text></View> : null}
              {successMessage ? <View style={styles.successContainer}><WebIcon name="checkmark-circle" size={20} color="#4CAF50" /><Text style={styles.successText}>{successMessage}</Text></View> : null}
              <TouchableOpacity style={[styles.submitButton, { backgroundColor: DEFAULT_SECONDARY }]} onPress={handleForgotPassword} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color={DEFAULT_PRIMARY} /> : <Text style={[styles.submitButtonText, { color: DEFAULT_PRIMARY }]}>Envoyer le lien</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaWrapper>
    );
  }

  // Reset password screen (from email link)
  if (mode === 'reset') {
    return (
      <SafeAreaWrapper backgroundColor={DEFAULT_PRIMARY} style={styles.container}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.formHeader}>
              <WebIcon name="lock-open-outline" size={60} color={DEFAULT_SECONDARY} />
              <Text style={[styles.formTitle, { color: DEFAULT_SECONDARY }]}>Nouveau mot de passe</Text>
            </View>
            <View style={styles.formContainer}>
              <Text style={[styles.forgotText, { color: DEFAULT_SECONDARY }]}>
                Créez votre nouveau mot de passe.
              </Text>
              <View style={styles.inputContainer}>
                <WebIcon name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Nouveau mot de passe" placeholderTextColor="#666" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
              </View>
              <View style={styles.inputContainer}>
                <WebIcon name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Confirmer le mot de passe" placeholderTextColor="#666" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
              </View>
              {error ? <View style={styles.errorContainer}><WebIcon name="alert-circle" size={20} color="#ff4444" /><Text style={styles.errorText}>{error}</Text></View> : null}
              {successMessage ? <View style={styles.successContainer}><WebIcon name="checkmark-circle" size={20} color="#4CAF50" /><Text style={styles.successText}>{successMessage}</Text></View> : null}
              <TouchableOpacity style={[styles.submitButton, { backgroundColor: DEFAULT_SECONDARY }]} onPress={handleResetPassword} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color={DEFAULT_PRIMARY} /> : <Text style={[styles.submitButtonText, { color: DEFAULT_PRIMARY }]}>Réinitialiser</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper backgroundColor={DEFAULT_PRIMARY} style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.backButton} onPress={() => { setMode('select'); setError(''); setEmail(''); setPassword(''); setName(''); setRestaurantName(''); }}>
            <WebIcon name="arrow-back" size={24} color={DEFAULT_SECONDARY} />
            <Text style={[styles.backText, { color: DEFAULT_SECONDARY }]}>Retour</Text>
          </TouchableOpacity>
          <View style={styles.formHeader}>
            <WebIcon name={mode === 'register' ? 'add-circle' : (loginType === 'admin' ? 'key' : 'person')} size={60} color={DEFAULT_SECONDARY} />
            <Text style={[styles.formTitle, { color: DEFAULT_SECONDARY }]}>{mode === 'register' ? 'Créer un restaurant' : (loginType === 'admin' ? 'Accès Pro' : 'Accès Personnel')}</Text>
          </View>
          <View style={styles.formContainer}>
            {mode === 'register' && (
              <>
                <View style={styles.inputContainer}><WebIcon name="business-outline" size={20} color="#666" style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Nom du restaurant" placeholderTextColor="#666" value={restaurantName} onChangeText={setRestaurantName} /></View>
                <View style={styles.inputContainer}><WebIcon name="person-outline" size={20} color="#666" style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Votre nom" placeholderTextColor="#666" value={name} onChangeText={setName} /></View>
              </>
            )}
            <View style={styles.inputContainer}><WebIcon name="mail-outline" size={20} color="#666" style={styles.inputIcon} /><TextInput style={styles.input} placeholder="Email" placeholderTextColor="#666" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></View>
            <View style={styles.inputContainer}>
              <WebIcon name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput 
                style={[styles.input, { flex: 1, ...(Platform.OS === 'web' && !showPassword ? { WebkitTextSecurity: 'disc' } : {}) }]} 
                placeholder="Mot de passe" 
                placeholderTextColor="#666" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry={Platform.OS !== 'web' && !showPassword}
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
                textContentType="none"
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 10 }}>
                <WebIcon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#666" />
              </TouchableOpacity>
            </View>
            {error ? <View style={styles.errorContainer}><WebIcon name="alert-circle" size={20} color="#ff4444" /><Text style={styles.errorText}>{error}</Text></View> : null}
            <TouchableOpacity style={[styles.submitButton, { backgroundColor: DEFAULT_SECONDARY }]} onPress={mode === 'register' ? handleRegister : handleLogin} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color={DEFAULT_PRIMARY} /> : <Text style={[styles.submitButtonText, { color: DEFAULT_PRIMARY }]}>{mode === 'register' ? 'Créer mon restaurant' : 'Se connecter'}</Text>}
            </TouchableOpacity>
            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotPasswordLink} onPress={() => { setMode('forgot'); setError(''); }}>
                <Text style={[styles.forgotPasswordText, { color: DEFAULT_SECONDARY }]}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
}

// ==================== USERS SCREEN ====================
function UsersScreen({ users, categories, primaryColor, secondaryColor, apiRequest, loadUsers, allRestaurants = [] }: any) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState<string | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState<User | null>(null);
  const [showEditUserModal, setShowEditUserModal] = useState<User | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null); // ID de l'utilisateur dont le menu est ouvert
  const [permissionsTab, setPermissionsTab] = useState(0); // 0-4 for 5 pages
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'staff' | 'associe'>('staff');
  const [newUserCategories, setNewUserCategories] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [isEditingUser, setIsEditingUser] = useState(false);
  
  // Structure de permissions détaillées
  const [detailedPerms, setDetailedPerms] = useState({
    // Accès aux restaurants (pour multi-restaurants)
    restaurants_access: {
      all: true, // true = tous les restaurants, false = sélection spécifique
      restaurant_ids: [] as string[], // IDs des restaurants autorisés si all=false
    },
    // Page 1 - Paramètres globaux
    parametres: false,
    equipe: false,
    taches: {
      actif: false,
      categories: [] as string[],
      editer: false,
      ajouter: false,
      supprimer: false,
      modeles_ajouter: false,
      modeles_modifier: false,
      modeles_supprimer: false,
    },
    preparation_commande: {
      actif: false,
      section: 'none' as string, // none, cuisine, bar, tous
      fournisseur: { ajouter: false, modifier: false, supprimer: false },
      produits: { ajouter: false, modifier: false, supprimer: false },
      consignes: { ajouter: false, modifier: false, supprimer: false },
    },
    // Page 2 - Menu Restaurant & Fiche Technique
    menu_restaurant: {
      actif: false,
      lien_partage: false,
      section: { ajouter: false, modifier: false, supprimer: false },
      produits: { ajouter: false, modifier: false, supprimer: false },
      export_pdf: false,
      export_csv: false,
      import_csv: false,
      import_pdf: false,
      note: false,
    },
    // Menu Restaurant en cours (Brouillon) - accès simple oui/non
    menu_restaurant_en_cours: {
      actif: false,
    },
    // Menu Client - accès simple oui/non
    menu_client: {
      actif: false,
    },
    // Prestataires - lecture ou modifier
    prestataires: {
      actif: false,
      mode: 'lecture' as 'lecture' | 'modifier',
    },
    fiche_technique: {
      actif: false,
      section_access: 'none' as string,
      export_pdf_excel: false,
      export_type: 'tous' as string,
      analyse_marges: false,
      section: { ajouter: false, modifier: false, supprimer: false },
      produits: { ajouter: false, modifier: false, supprimer: false },
      photo: { ajouter: false, supprimer: false },
    },
    // Page 3 - Menu Groupe
    menu_groupe: {
      actif: false,
      bouton_lien: false,
      section: { ajouter: false, modifier: false, supprimer: false },
      plats: { ajouter: false, modifier: false, supprimer: false },
      reservation_creer: false,
      reservation_modifier: false,
      reservation_supprimer: false,
      statut: false,
      proposition: false,
      facture: false,
    },
    // Page 4 - Événements & Facturation
    evenement: {
      actif: false,
      ajouter: false,
      modifier: false,
      supprimer: false,
      archiver: false,
      prestataires: { ajouter: false, modifier: false, supprimer: false },
    },
    facturation: {
      actif: false,
      facture_deposer: false,
      facture_telecharger: false,
      devis_deposer: false,
      devis_telecharger: false,
    },
    // Page 5 - Ardoise (nouvelle structure granulaire)
    ardoise: {
      actif: false,
      edition: { acces: false, mode: 'lecture' },
      ventes: { acces: false, mode: 'lecture' },
      rapports: { acces: false, mode: 'lecture', export_pdf: false, export_excel: false },
      // Anciens champs pour compatibilité
      menu: false,
      pdf: false,
      section: { ajouter: false, modifier: false, supprimer: false },
      produits: { ajouter: false, modifier: false, supprimer: false },
      packages_prix: { ajouter: false, modifier: false, supprimer: false },
    },
  });

  const addUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPassword) { showAlert('Erreur', 'Veuillez remplir les champs obligatoires'); return; }
    setIsAdding(true);
    try {
      await apiRequest('/users/create', { 
        method: 'POST', 
        body: JSON.stringify({ 
          name: newUserName, 
          email: newUserEmail, 
          password: newUserPassword, 
          role: newUserRole, 
          assigned_categories: newUserCategories,
          detailed_permissions: detailedPerms
        }) 
      });
      setShowAddModal(false); setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserCategories([]); setNewUserRole('staff');
      loadUsers();
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsAdding(false); }
  };

  const openPermissionsModal = (user: User) => {
    console.log('[OPEN_PERM_MODAL] Opening for user:', user?.name, user?.user_id, 'user object:', JSON.stringify(user));
    if (!user) {
      console.error('[OPEN_PERM_MODAL] ERROR: user is undefined or null');
      return;
    }
    setShowPermissionsModal(user);
    setPermissionsTab(0);
    
    // Déterminer les restaurants_access à partir de user.restaurant_ids
    const userRestaurantIds = user.restaurant_ids || [];
    const hasSpecificRestaurants = userRestaurantIds.length > 0;
    const initialRestaurantsAccess = hasSpecificRestaurants 
      ? { all: false, restaurant_ids: userRestaurantIds }
      : { all: true, restaurant_ids: [] };
    
    // Permissions par défaut avec restaurants_access basé sur les données existantes
    const defaultPerms = {
      restaurants_access: initialRestaurantsAccess,
      parametres: false,
      equipe: false,
      taches: { actif: false, categories: user.assigned_categories || [], editer: false, ajouter: false, supprimer: false, modeles_ajouter: false, modeles_modifier: false, modeles_supprimer: false },
      preparation_commande: { actif: false, section: 'none', fournisseur: { ajouter: false, modifier: false, supprimer: false }, produits: { ajouter: false, modifier: false, supprimer: false }, consignes: { ajouter: false, modifier: false, supprimer: false } },
      menu_restaurant: { actif: false, lien_partage: false, section: { ajouter: false, modifier: false, supprimer: false }, produits: { ajouter: false, modifier: false, supprimer: false }, export_pdf: false, export_csv: false, import_csv: false, import_pdf: false, note: false },
      menu_restaurant_en_cours: { actif: false },
      menu_client: { actif: false },
      prestataires: { actif: false, mode: 'lecture' },
      fiche_technique: { actif: false, section_access: 'none', export_pdf_excel: false, export_type: 'tous', analyse_marges: false, section: { ajouter: false, modifier: false, supprimer: false }, produits: { ajouter: false, modifier: false, supprimer: false }, photo: { ajouter: false, supprimer: false } },
      menu_groupe: { actif: false, bouton_lien: false, section: { ajouter: false, modifier: false, supprimer: false }, plats: { ajouter: false, modifier: false, supprimer: false }, reservation_creer: false, reservation_modifier: false, reservation_supprimer: false, statut: false, proposition: false, facture: false },
      evenement: { actif: false, ajouter: false, modifier: false, supprimer: false, archiver: false, prestataires: { ajouter: false, modifier: false, supprimer: false } },
      facturation: { actif: false, facture_deposer: false, facture_telecharger: false, devis_deposer: false, devis_telecharger: false },
      ardoise: { actif: false, edition: { acces: false, mode: 'lecture' }, ventes: { acces: false, mode: 'lecture' }, rapports: { acces: false, mode: 'lecture', export_pdf: false, export_excel: false }, menu: false, pdf: false, section: { ajouter: false, modifier: false, supprimer: false }, produits: { ajouter: false, modifier: false, supprimer: false }, packages_prix: { ajouter: false, modifier: false, supprimer: false } },
    };
    
    // Vérifier si user a detailed_permissions (peut être undefined pour les nouveaux utilisateurs)
    const userDetailedPerms = (user as any).detailed_permissions;
    console.log('[OPEN_PERM_MODAL] User detailed_permissions:', userDetailedPerms);
    
    if (userDetailedPerms && Object.keys(userDetailedPerms).length > 0) {
      // Fusion profonde des permissions existantes avec les valeurs par défaut
      const dp = userDetailedPerms;
      const mergedPerms = {
        ...defaultPerms,
        ...dp,
        // Préserver les restaurants_access initialisés à partir de user.restaurant_ids
        // sauf si dp.restaurants_access existe explicitement
        restaurants_access: dp.restaurants_access || initialRestaurantsAccess,
        // Fusion profonde pour les objets imbriqués
        taches: { ...defaultPerms.taches, ...(dp.taches || {}) },
        preparation_commande: { ...defaultPerms.preparation_commande, ...(dp.preparation_commande || {}) },
        menu_restaurant: { ...defaultPerms.menu_restaurant, ...(dp.menu_restaurant || {}) },
        fiche_technique: { ...defaultPerms.fiche_technique, ...(dp.fiche_technique || {}) },
        menu_groupe: { ...defaultPerms.menu_groupe, ...(dp.menu_groupe || {}) },
        evenement: { ...defaultPerms.evenement, ...(dp.evenement || {}) },
        facturation: { ...defaultPerms.facturation, ...(dp.facturation || {}) },
        ardoise: { ...defaultPerms.ardoise, ...(dp.ardoise || {}) },
      };
      setDetailedPerms(mergedPerms);
    } else {
      console.log('[OPEN_PERM_MODAL] Using default permissions');
      setDetailedPerms(defaultPerms);
    }
  };

  const savePermissions = async () => {
    if (!showPermissionsModal) return;
    setIsSavingPermissions(true);
    try {
      // Calculer les restaurant_ids à partir de restaurants_access
      let restaurantIds: string[] = [];
      if (detailedPerms.restaurants_access?.all) {
        // Accès à tous les restaurants - inclure tous les restaurants disponibles
        restaurantIds = allRestaurants.map((r: any) => r.restaurant_id);
        console.log('[SAVE_PERMS] Mode: all restaurants, count:', allRestaurants.length);
      } else {
        restaurantIds = detailedPerms.restaurants_access?.restaurant_ids || [];
        console.log('[SAVE_PERMS] Mode: specific restaurants, ids:', restaurantIds);
      }
      
      // Si aucun restaurant n'est sélectionné et que allRestaurants est vide, 
      // conserver les restaurant_ids existants de l'utilisateur
      if (restaurantIds.length === 0 && showPermissionsModal.restaurant_ids?.length > 0) {
        restaurantIds = showPermissionsModal.restaurant_ids;
        console.log('[SAVE_PERMS] Fallback: using existing restaurant_ids:', restaurantIds);
      }
      
      const payload = { 
        detailed_permissions: detailedPerms,
        restaurant_ids: restaurantIds
      };
      console.log('[SAVE_PERMS] Saving for user:', showPermissionsModal.user_id, 'payload keys:', Object.keys(payload));
      
      await apiRequest(`/users/${showPermissionsModal.user_id}`, { 
        method: 'PUT', 
        body: JSON.stringify(payload) 
      });
      showAlert('Succès', 'Permissions mises à jour');
      setShowPermissionsModal(null);
      loadUsers();
    } catch (error: any) { 
      console.error('[SAVE_PERMS] Error:', error);
      showAlert('Erreur', error.message); 
    }
    finally { setIsSavingPermissions(false); }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 4) { showAlert('Erreur', 'Min 4 caractères'); return; }
    try { await apiRequest(`/users/${showResetModal}/reset-password`, { method: 'PUT', body: JSON.stringify({ new_password: newPassword }) }); showAlert('Succès', 'Mot de passe réinitialisé'); setShowResetModal(null); setNewPassword(''); }
    catch (error: any) { showAlert('Erreur', error.message); }
  };

  const deleteUser = async (userId: string, userName: string) => {
    const confirmed = typeof window !== 'undefined' 
      ? window.confirm(`Supprimer "${userName}" ?`)
      : true;
    if (!confirmed) return;
    try { await apiRequest(`/users/${userId}`, { method: 'DELETE' }); loadUsers(); } catch (e) { showAlert('Erreur', 'Impossible'); }
  };

  // Nouvelle fonction: Donner tous les accès à un staff en un clic
  const grantFullAccess = async (userId: string, userName: string) => {
    const confirmed = typeof window !== 'undefined' 
      ? window.confirm(`Donner tous les accès à "${userName}" ?\n\nCela activera tous les modules pour cet utilisateur.`)
      : true;
    if (!confirmed) return;
    try { 
      await apiRequest(`/users/${userId}/grant-full-access`, { method: 'POST' }); 
      showAlert('Succès', `Tous les accès ont été accordés à ${userName}`);
      loadUsers(); 
    } catch (e: any) { 
      showAlert('Erreur', e.message || 'Impossible'); 
    }
  };

  const toggleCategory = (categoryId: string) => { if (newUserCategories.includes(categoryId)) setNewUserCategories(newUserCategories.filter(id => id !== categoryId)); else setNewUserCategories([...newUserCategories, categoryId]); };
  const getCategoryNames = (categoryIds: string[]) => categoryIds.map(id => categories.find((c: Category) => c.category_id === id)?.name).filter(Boolean).join(', ');
  
  const getPermissionSummary = (user: User) => {
    const dp = user.detailed_permissions;
    if (!dp) return 'Non configuré';
    const parts = [];
    if (dp.taches?.actif) parts.push('Tâches');
    if (dp.menu_groupe?.actif) parts.push('Menu Grp');
    if (dp.preparation_commande?.actif) parts.push('Prép.');
    if (dp.fiche_technique?.actif) parts.push('Fiches');
    if (dp.menu_restaurant?.actif) parts.push('Menu');
    if (dp.evenement?.actif) parts.push('Events');
    if (dp.ardoise?.actif) parts.push('Ardoise');
    if (parts.length === 0) return 'Aucun accès';
    return parts.join(' • ');
  };

  // Composant Toggle réutilisable
  const PermToggle = ({ label, value, onChange, icon }: { label: string, value: boolean, onChange: (v: boolean) => void, icon?: string }) => (
    <TouchableOpacity 
      style={[styles.permToggleCompact, value && { backgroundColor: `${primaryColor}15`, borderColor: primaryColor }]} 
      onPress={() => onChange(!value)}
    >
      {icon && <Text style={{ marginRight: 8 }}>{icon}</Text>}
      <Text style={[styles.permToggleLabelCompact, { color: primaryColor }]}>{label}</Text>
      <View style={[styles.permToggleSwitchSmall, value && { backgroundColor: primaryColor }]}>
        <View style={[styles.permToggleDotSmall, value && { transform: [{ translateX: 14 }] }]} />
      </View>
    </TouchableOpacity>
  );

  // Composant Actions AMS (Ajouter/Modifier/Supprimer)
  const ActionPerms = ({ label, perms, onChange }: { label: string, perms: { ajouter: boolean, modifier: boolean, supprimer: boolean }, onChange: (p: any) => void }) => (
    <View style={styles.actionPermsContainer}>
      <Text style={[styles.actionPermsLabel, { color: primaryColor }]}>{label}</Text>
      <View style={styles.actionPermsRow}>
        <TouchableOpacity style={[styles.actionPermBtn, perms.ajouter && styles.actionPermBtnActive]} onPress={() => onChange({ ...perms, ajouter: !perms.ajouter })}>
          <Text style={[styles.actionPermBtnText, perms.ajouter && { color: '#fff' }]}>+ Ajouter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionPermBtn, perms.modifier && styles.actionPermBtnActive]} onPress={() => onChange({ ...perms, modifier: !perms.modifier })}>
          <Text style={[styles.actionPermBtnText, perms.modifier && { color: '#fff' }]}>✏️ Modifier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionPermBtn, perms.supprimer && styles.actionPermBtnActive]} onPress={() => onChange({ ...perms, supprimer: !perms.supprimer })}>
          <Text style={[styles.actionPermBtnText, perms.supprimer && { color: '#fff' }]}>🗑️ Suppr.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Pages de permissions
  const renderPermissionsPage = () => {
    switch (permissionsTab) {
      case 0: // Page 1 - Tâches & Préparation
        return (
          <View>
            <Text style={[styles.permPageTitle, { color: primaryColor }]}>1/5 - Paramètres & Tâches</Text>
            
            {/* Section Accès aux restaurants */}
            <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565c0', marginBottom: 12 }}>🏪 Accès aux Restaurants</Text>
              
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: detailedPerms.restaurants_access.all ? primaryColor : '#fff', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: primaryColor }}
                onPress={() => setDetailedPerms({...detailedPerms, restaurants_access: { all: true, restaurant_ids: [] }})}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: detailedPerms.restaurants_access.all ? '#fff' : primaryColor, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                  {detailedPerms.restaurants_access.all && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{ color: detailedPerms.restaurants_access.all ? '#fff' : primaryColor, fontWeight: '600' }}>✅ Tous les restaurants</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: !detailedPerms.restaurants_access.all ? primaryColor : '#fff', borderRadius: 8, borderWidth: 1, borderColor: primaryColor }}
                onPress={() => setDetailedPerms({...detailedPerms, restaurants_access: { all: false, restaurant_ids: detailedPerms.restaurants_access.restaurant_ids }})}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: !detailedPerms.restaurants_access.all ? '#fff' : primaryColor, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                  {!detailedPerms.restaurants_access.all && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{ color: !detailedPerms.restaurants_access.all ? '#fff' : primaryColor, fontWeight: '600' }}>🎯 Restaurants spécifiques</Text>
              </TouchableOpacity>
              
              {/* Liste des restaurants si sélection spécifique */}
              {!detailedPerms.restaurants_access.all && (
                <View style={{ marginTop: 12, backgroundColor: '#fff', borderRadius: 8, padding: 10 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Sélectionnez les restaurants autorisés:</Text>
                  {allRestaurants.length === 0 ? (
                    <Text style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', padding: 10 }}>Aucun restaurant disponible</Text>
                  ) : (
                    allRestaurants.map((rest: any) => {
                      const isSelected = detailedPerms.restaurants_access.restaurant_ids.includes(rest.restaurant_id);
                      return (
                        <TouchableOpacity 
                          key={rest.restaurant_id}
                          style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: isSelected ? `${primaryColor}15` : '#f9f9f9', borderRadius: 8, marginBottom: 6 }}
                          onPress={() => {
                            const ids = detailedPerms.restaurants_access.restaurant_ids;
                            const newIds = isSelected 
                              ? ids.filter(id => id !== rest.restaurant_id)
                              : [...ids, rest.restaurant_id];
                            setDetailedPerms({...detailedPerms, restaurants_access: { all: false, restaurant_ids: newIds }});
                          }}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: primaryColor, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? primaryColor : 'transparent' }}>
                            {isSelected && <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>}
                          </View>
                          <Text style={{ color: '#333', fontWeight: isSelected ? '600' : '400' }}>{rest.name}</Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                  {detailedPerms.restaurants_access.restaurant_ids.length > 0 && (
                    <Text style={{ fontSize: 11, color: '#1565c0', marginTop: 8, textAlign: 'center' }}>
                      {detailedPerms.restaurants_access.restaurant_ids.length} restaurant(s) sélectionné(s)
                    </Text>
                  )}
                </View>
              )}
            </View>
            
            <PermToggle label="Paramètres restaurant" value={detailedPerms.parametres} onChange={(v) => setDetailedPerms({...detailedPerms, parametres: v})} icon="⚙️" />
            <PermToggle label="Équipe (voir membres)" value={detailedPerms.equipe} onChange={(v) => setDetailedPerms({...detailedPerms, equipe: v})} icon="👥" />
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>📋 Tâches - Catégories</Text>
            <PermToggle label="Accès aux tâches" value={detailedPerms.taches.actif} onChange={(v) => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, actif: v}})} />
            
            {detailedPerms.taches.actif && (
              <View style={styles.subPermsContainer}>
                <View style={styles.actionPermsRow}>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.taches.editer && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, editer: !detailedPerms.taches.editer}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.taches.editer && { color: '#fff' }]}>✏️ Éditer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.taches.ajouter && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, ajouter: !detailedPerms.taches.ajouter}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.taches.ajouter && { color: '#fff' }]}>+ Ajouter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.taches.supprimer && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, supprimer: !detailedPerms.taches.supprimer}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.taches.supprimer && { color: '#fff' }]}>🗑️ Suppr.</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.permSubLabel}>Catégories accessibles:</Text>
                <View style={styles.categoryCheckboxList}>
                  {categories.map((cat: Category) => (
                    <TouchableOpacity key={cat.category_id} style={styles.categoryCheckboxItem} onPress={() => {
                      const cats = detailedPerms.taches.categories.includes(cat.category_id) 
                        ? detailedPerms.taches.categories.filter(c => c !== cat.category_id)
                        : [...detailedPerms.taches.categories, cat.category_id];
                      setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, categories: cats}});
                    }}>
                      <View style={[styles.categoryCheckbox, { borderColor: primaryColor }, detailedPerms.taches.categories.includes(cat.category_id) && { backgroundColor: primaryColor }]}>
                        {detailedPerms.taches.categories.includes(cat.category_id) && <WebIcon name="checkmark" size={14} color={secondaryColor} />}
                      </View>
                      <Text style={styles.categoryCheckboxLabel}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Permissions Modèles de tâches */}
                <View style={styles.permDivider} />
                <Text style={styles.permSubLabel}>Gérer les modèles de tâches:</Text>
                <View style={styles.actionPermsRow}>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.taches.modeles_ajouter && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, modeles_ajouter: !detailedPerms.taches.modeles_ajouter}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.taches.modeles_ajouter && { color: '#fff' }]}>+ Ajouter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.taches.modeles_modifier && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, modeles_modifier: !detailedPerms.taches.modeles_modifier}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.taches.modeles_modifier && { color: '#fff' }]}>✏️ Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.taches.modeles_supprimer && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, taches: {...detailedPerms.taches, modeles_supprimer: !detailedPerms.taches.modeles_supprimer}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.taches.modeles_supprimer && { color: '#fff' }]}>🗑️ Suppr.</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>📦 Préparation de commande</Text>
            <PermToggle label="Accès préparation" value={detailedPerms.preparation_commande.actif} onChange={(v) => setDetailedPerms({...detailedPerms, preparation_commande: {...detailedPerms.preparation_commande, actif: v}})} />
            
            {detailedPerms.preparation_commande.actif && (
              <View style={styles.subPermsContainer}>
                <Text style={styles.permSubLabel}>Section:</Text>
                <View style={styles.sectionPicker}>
                  {['none', 'cuisine', 'bar', 'tous'].map(s => (
                    <TouchableOpacity key={s} style={[styles.sectionBtn, detailedPerms.preparation_commande.section === s && styles.sectionBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, preparation_commande: {...detailedPerms.preparation_commande, section: s}})}>
                      <Text style={[styles.sectionBtnText, detailedPerms.preparation_commande.section === s && { color: '#fff' }]}>{s === 'none' ? 'Aucun' : s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ActionPerms label="Fournisseur" perms={detailedPerms.preparation_commande.fournisseur} onChange={(p) => setDetailedPerms({...detailedPerms, preparation_commande: {...detailedPerms.preparation_commande, fournisseur: p}})} />
                <ActionPerms label="Produits" perms={detailedPerms.preparation_commande.produits} onChange={(p) => setDetailedPerms({...detailedPerms, preparation_commande: {...detailedPerms.preparation_commande, produits: p}})} />
                <ActionPerms label="Consignes" perms={detailedPerms.preparation_commande.consignes} onChange={(p) => setDetailedPerms({...detailedPerms, preparation_commande: {...detailedPerms.preparation_commande, consignes: p}})} />
              </View>
            )}
          </View>
        );
      
      case 1: // Page 2 - Menu Restaurant & Fiche Technique
        return (
          <View>
            <Text style={[styles.permPageTitle, { color: primaryColor }]}>2/5 - Menu Restaurant & Fiche Technique</Text>
            
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>🍽️ Menu Restaurant</Text>
            <PermToggle label="Accès Menu Restaurant" value={detailedPerms.menu_restaurant.actif} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, actif: v}})} />
            
            {detailedPerms.menu_restaurant.actif && (
              <View style={styles.subPermsContainer}>
                <PermToggle label="Lien partagé" value={detailedPerms.menu_restaurant.lien_partage} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, lien_partage: v}})} />
                <ActionPerms label="Section" perms={detailedPerms.menu_restaurant.section} onChange={(p) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, section: p}})} />
                <ActionPerms label="Produits" perms={detailedPerms.menu_restaurant.produits} onChange={(p) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, produits: p}})} />
                <View style={styles.exportPermsRow}>
                  <PermToggle label="Export PDF" value={detailedPerms.menu_restaurant.export_pdf} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, export_pdf: v}})} />
                  <PermToggle label="Export CSV" value={detailedPerms.menu_restaurant.export_csv} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, export_csv: v}})} />
                </View>
                <View style={styles.exportPermsRow}>
                  <PermToggle label="Import CSV" value={detailedPerms.menu_restaurant.import_csv} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, import_csv: v}})} />
                  <PermToggle label="Import PDF" value={detailedPerms.menu_restaurant.import_pdf} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, import_pdf: v}})} />
                </View>
                <PermToggle label="Note" value={detailedPerms.menu_restaurant.note} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant: {...detailedPerms.menu_restaurant, note: v}})} />
              </View>
            )}
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>✏️ Menu Restaurant en cours</Text>
            <PermToggle label="Accès Menu en cours (Brouillon)" value={detailedPerms.menu_restaurant_en_cours?.actif || false} onChange={(v) => setDetailedPerms({...detailedPerms, menu_restaurant_en_cours: { actif: v }})} />
            <Text style={{ fontSize: 12, color: '#666', marginTop: 4, marginLeft: 8 }}>Permet de modifier le menu brouillon avant publication</Text>
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>👁️ Menu Client</Text>
            <PermToggle label="Accès Menu Client" value={detailedPerms.menu_client?.actif || false} onChange={(v) => setDetailedPerms({...detailedPerms, menu_client: { actif: v }})} />
            <Text style={{ fontSize: 12, color: '#666', marginTop: 4, marginLeft: 8 }}>Permet de voir le menu client public</Text>
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>🤝 Prestataires</Text>
            <PermToggle label="Accès Prestataires" value={detailedPerms.prestataires?.actif || false} onChange={(v) => setDetailedPerms({...detailedPerms, prestataires: {...(detailedPerms.prestataires || { actif: false, mode: 'lecture' }), actif: v}})} />
            
            {(detailedPerms.prestataires?.actif) && (
              <View style={styles.subPermsContainer}>
                <Text style={styles.permSubLabel}>Mode d'accès:</Text>
                <View style={styles.modeOptions}>
                  <TouchableOpacity 
                    style={[styles.modeOption, detailedPerms.prestataires?.mode === 'lecture' && { backgroundColor: primaryColor }]}
                    onPress={() => setDetailedPerms({...detailedPerms, prestataires: {...detailedPerms.prestataires, mode: 'lecture'}})}
                  >
                    <Text style={[styles.modeOptionText, detailedPerms.prestataires?.mode === 'lecture' && { color: '#fff' }]}>👁️ Lecture seule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modeOption, detailedPerms.prestataires?.mode === 'modifier' && { backgroundColor: primaryColor }]}
                    onPress={() => setDetailedPerms({...detailedPerms, prestataires: {...detailedPerms.prestataires, mode: 'modifier'}})}
                  >
                    <Text style={[styles.modeOptionText, detailedPerms.prestataires?.mode === 'modifier' && { color: '#fff' }]}>✏️ Modifier</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>📄 Fiche Technique</Text>
            <PermToggle label="Accès Fiche Technique" value={detailedPerms.fiche_technique.actif} onChange={(v) => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, actif: v}})} />
            
            {detailedPerms.fiche_technique.actif && (
              <View style={styles.subPermsContainer}>
                <Text style={styles.permSubLabel}>Section:</Text>
                <View style={styles.sectionPicker}>
                  {['none', 'bar', 'cuisine', 'tous'].map(s => (
                    <TouchableOpacity key={s} style={[styles.sectionBtn, detailedPerms.fiche_technique.section_access === s && styles.sectionBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, section_access: s}})}>
                      <Text style={[styles.sectionBtnText, detailedPerms.fiche_technique.section_access === s && { color: '#fff' }]}>{s === 'none' ? 'Aucun' : s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <PermToggle label="Export PDF/Excel" value={detailedPerms.fiche_technique.export_pdf_excel} onChange={(v) => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, export_pdf_excel: v}})} />
                <Text style={styles.permSubLabel}>Type d'export:</Text>
                <View style={styles.sectionPicker}>
                  {['tous', 'avec_prix', 'sans_prix'].map(t => (
                    <TouchableOpacity key={t} style={[styles.sectionBtn, detailedPerms.fiche_technique.export_type === t && styles.sectionBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, export_type: t}})}>
                      <Text style={[styles.sectionBtnText, detailedPerms.fiche_technique.export_type === t && { color: '#fff' }]}>{t === 'tous' ? 'Tous' : t === 'avec_prix' ? 'Avec prix' : 'Sans prix'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <PermToggle label="Analyse des Marges" value={detailedPerms.fiche_technique.analyse_marges} onChange={(v) => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, analyse_marges: v}})} />
                <ActionPerms label="Section" perms={detailedPerms.fiche_technique.section} onChange={(p) => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, section: p}})} />
                <ActionPerms label="Produits" perms={detailedPerms.fiche_technique.produits} onChange={(p) => setDetailedPerms({...detailedPerms, fiche_technique: {...detailedPerms.fiche_technique, produits: p}})} />
              </View>
            )}
          </View>
        );
      
      case 2: // Page 3 - Menu Groupe
        return (
          <View>
            <Text style={[styles.permPageTitle, { color: primaryColor }]}>3/5 - Menu Groupe</Text>
            
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>🍴 Menu Groupe</Text>
            <PermToggle label="Accès Menu Groupe" value={detailedPerms.menu_groupe.actif} onChange={(v) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, actif: v}})} />
            
            {detailedPerms.menu_groupe.actif && (
              <View style={styles.subPermsContainer}>
                <PermToggle label="Bouton lien" value={detailedPerms.menu_groupe.bouton_lien} onChange={(v) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, bouton_lien: v}})} />
                <ActionPerms label="Section" perms={detailedPerms.menu_groupe.section} onChange={(p) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, section: p}})} />
                <ActionPerms label="Plats (Produits)" perms={detailedPerms.menu_groupe.plats} onChange={(p) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, plats: p}})} />
                
                <Text style={[styles.permSubLabel, { marginTop: 12 }]}>Réservations:</Text>
                <View style={styles.actionPermsRow}>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.menu_groupe.reservation_creer && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, reservation_creer: !detailedPerms.menu_groupe.reservation_creer}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.menu_groupe.reservation_creer && { color: '#fff' }]}>+ Créer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.menu_groupe.reservation_modifier && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, reservation_modifier: !detailedPerms.menu_groupe.reservation_modifier}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.menu_groupe.reservation_modifier && { color: '#fff' }]}>✏️ Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.menu_groupe.reservation_supprimer && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, reservation_supprimer: !detailedPerms.menu_groupe.reservation_supprimer}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.menu_groupe.reservation_supprimer && { color: '#fff' }]}>🗑️ Suppr.</Text>
                  </TouchableOpacity>
                </View>
                
                <PermToggle label="Statut" value={detailedPerms.menu_groupe.statut} onChange={(v) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, statut: v}})} />
                <PermToggle label="Proposition" value={detailedPerms.menu_groupe.proposition} onChange={(v) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, proposition: v}})} />
                <PermToggle label="Facture" value={detailedPerms.menu_groupe.facture} onChange={(v) => setDetailedPerms({...detailedPerms, menu_groupe: {...detailedPerms.menu_groupe, facture: v}})} />
              </View>
            )}
          </View>
        );
      
      case 3: // Page 4 - Événements & Facturation
        return (
          <View>
            <Text style={[styles.permPageTitle, { color: primaryColor }]}>4/5 - Événements & Facturation</Text>
            
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>🎉 Événements</Text>
            <PermToggle label="Accès Événements" value={detailedPerms.evenement.actif} onChange={(v) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, actif: v}})} />
            
            {detailedPerms.evenement.actif && (
              <View style={styles.subPermsContainer}>
                <Text style={styles.permSubLabel}>Événements:</Text>
                <View style={styles.actionPermsRow}>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.evenement.ajouter && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, ajouter: !detailedPerms.evenement.ajouter}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.evenement.ajouter && { color: '#fff' }]}>+ Ajouter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.evenement.modifier && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, modifier: !detailedPerms.evenement.modifier}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.evenement.modifier && { color: '#fff' }]}>✏️ Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionPermBtn, detailedPerms.evenement.supprimer && styles.actionPermBtnActive]} onPress={() => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, supprimer: !detailedPerms.evenement.supprimer}})}>
                    <Text style={[styles.actionPermBtnText, detailedPerms.evenement.supprimer && { color: '#fff' }]}>🗑️ Suppr.</Text>
                  </TouchableOpacity>
                </View>
                <PermToggle label="Archiver événements" value={detailedPerms.evenement.archiver} onChange={(v) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, archiver: v}})} />
                
                <View style={styles.permDivider} />
                <Text style={styles.permSubLabel}>Menu de l'événement - Sections:</Text>
                <ActionPerms label="Sections" perms={detailedPerms.evenement.menu_section || {}} onChange={(p) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, menu_section: p}})} />
                
                <Text style={styles.permSubLabel}>Menu de l'événement - Plats:</Text>
                <ActionPerms label="Plats" perms={detailedPerms.evenement.menu_plats || {}} onChange={(p) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, menu_plats: p}})} />
                
                <Text style={styles.permSubLabel}>Menu de l'événement - Packages:</Text>
                <ActionPerms label="Packages" perms={detailedPerms.evenement.menu_packages || {}} onChange={(p) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, menu_packages: p}})} />
                
                <View style={styles.permDivider} />
                <Text style={styles.permSubLabel}>Tâches de l'événement:</Text>
                <ActionPerms label="Tâches" perms={detailedPerms.evenement.taches || {}} onChange={(p) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, taches: p}})} />
                
                <View style={styles.permDivider} />
                <Text style={styles.permSubLabel}>Prestataires de l'événement:</Text>
                <ActionPerms label="Prestataires" perms={detailedPerms.evenement.prestataires} onChange={(p) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, prestataires: p}})} />
                
                <View style={styles.permDivider} />
                <Text style={styles.permSubLabel}>Génération PDF:</Text>
                <View style={styles.exportPermsRow}>
                  <PermToggle label="Proposition" value={detailedPerms.evenement.proposition_generer || false} onChange={(v) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, proposition_generer: v}})} />
                  <PermToggle label="Facture" value={detailedPerms.evenement.facture_generer || false} onChange={(v) => setDetailedPerms({...detailedPerms, evenement: {...detailedPerms.evenement, facture_generer: v}})} />
                </View>
              </View>
            )}
            
            <View style={styles.permDivider} />
            <Text style={[styles.permGroupTitle, { color: primaryColor }]}>💶 Facturation</Text>
            <PermToggle label="Accès Facturation" value={detailedPerms.facturation.actif} onChange={(v) => setDetailedPerms({...detailedPerms, facturation: {...detailedPerms.facturation, actif: v}})} />
            
            {detailedPerms.facturation.actif && (
              <View style={styles.subPermsContainer}>
                <Text style={styles.permSubLabel}>Factures:</Text>
                <View style={styles.exportPermsRow}>
                  <PermToggle label="Déposer" value={detailedPerms.facturation.facture_deposer} onChange={(v) => setDetailedPerms({...detailedPerms, facturation: {...detailedPerms.facturation, facture_deposer: v}})} />
                  <PermToggle label="Télécharger" value={detailedPerms.facturation.facture_telecharger} onChange={(v) => setDetailedPerms({...detailedPerms, facturation: {...detailedPerms.facturation, facture_telecharger: v}})} />
                </View>
                <Text style={styles.permSubLabel}>Devis:</Text>
                <View style={styles.exportPermsRow}>
                  <PermToggle label="Déposer" value={detailedPerms.facturation.devis_deposer} onChange={(v) => setDetailedPerms({...detailedPerms, facturation: {...detailedPerms.facturation, devis_deposer: v}})} />
                  <PermToggle label="Télécharger" value={detailedPerms.facturation.devis_telecharger} onChange={(v) => setDetailedPerms({...detailedPerms, facturation: {...detailedPerms.facturation, devis_telecharger: v}})} />
                </View>
              </View>
            )}
          </View>
        );
      
      case 4: // Page 5 - Ardoise (nouvelle structure granulaire)
        // Initialiser les sous-objets si manquants (migration des anciens utilisateurs)
        const ardoisePerms = detailedPerms.ardoise || {};
        const editionPerms = ardoisePerms.edition || { acces: false, mode: 'lecture' };
        const ventesPerms = ardoisePerms.ventes || { acces: false, mode: 'lecture' };
        const rapportsPerms = ardoisePerms.rapports || { acces: false, mode: 'lecture', export_pdf: false, export_excel: false };
        
        return (
          <View>
            <Text style={[styles.permPageTitle, { color: primaryColor }]}>5/5 - Ardoise</Text>
            
            <PermToggle 
              label="Accès au module Ardoise" 
              value={ardoisePerms.actif || false} 
              onChange={(v) => setDetailedPerms({...detailedPerms, ardoise: {...ardoisePerms, actif: v}})} 
              icon="📊"
            />
            
            {ardoisePerms.actif && (
              <View style={styles.subPermsContainer}>
                
                {/* ÉDITION */}
                <View style={[styles.permSectionBox, { borderColor: primaryColor + '30', marginBottom: 16 }]}>
                  <Text style={[styles.permGroupTitle, { color: primaryColor, marginBottom: 8 }]}>✏️ Édition</Text>
                  <PermToggle 
                    label="Accès à l'onglet Édition" 
                    value={editionPerms.acces} 
                    onChange={(v) => setDetailedPerms({
                      ...detailedPerms, 
                      ardoise: {...ardoisePerms, edition: {...editionPerms, acces: v}}
                    })} 
                  />
                  {editionPerms.acces && (
                    <View style={styles.modeSelector}>
                      <Text style={[styles.modeSelectorLabel, { color: primaryColor }]}>Mode d'accès:</Text>
                      <View style={styles.modeOptions}>
                        <TouchableOpacity 
                          style={[styles.modeOption, editionPerms.mode === 'lecture' && { backgroundColor: primaryColor }]}
                          onPress={() => setDetailedPerms({
                            ...detailedPerms, 
                            ardoise: {...ardoisePerms, edition: {...editionPerms, mode: 'lecture'}}
                          })}
                        >
                          <Text style={[styles.modeOptionText, editionPerms.mode === 'lecture' && { color: '#fff' }]}>👁️ Lecture seule</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.modeOption, editionPerms.mode === 'modifier' && { backgroundColor: primaryColor }]}
                          onPress={() => setDetailedPerms({
                            ...detailedPerms, 
                            ardoise: {...ardoisePerms, edition: {...editionPerms, mode: 'modifier'}}
                          })}
                        >
                          <Text style={[styles.modeOptionText, editionPerms.mode === 'modifier' && { color: '#fff' }]}>✏️ Modifier</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
                
                {/* VENTES */}
                <View style={[styles.permSectionBox, { borderColor: primaryColor + '30', marginBottom: 16 }]}>
                  <Text style={[styles.permGroupTitle, { color: primaryColor, marginBottom: 8 }]}>📈 Ventes</Text>
                  <PermToggle 
                    label="Accès à l'onglet Ventes" 
                    value={ventesPerms.acces} 
                    onChange={(v) => setDetailedPerms({
                      ...detailedPerms, 
                      ardoise: {...ardoisePerms, ventes: {...ventesPerms, acces: v}}
                    })} 
                  />
                  {ventesPerms.acces && (
                    <View style={styles.modeSelector}>
                      <Text style={[styles.modeSelectorLabel, { color: primaryColor }]}>Mode d'accès:</Text>
                      <View style={styles.modeOptions}>
                        <TouchableOpacity 
                          style={[styles.modeOption, ventesPerms.mode === 'lecture' && { backgroundColor: primaryColor }]}
                          onPress={() => setDetailedPerms({
                            ...detailedPerms, 
                            ardoise: {...ardoisePerms, ventes: {...ventesPerms, mode: 'lecture'}}
                          })}
                        >
                          <Text style={[styles.modeOptionText, ventesPerms.mode === 'lecture' && { color: '#fff' }]}>👁️ Lecture seule</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.modeOption, ventesPerms.mode === 'modifier' && { backgroundColor: primaryColor }]}
                          onPress={() => setDetailedPerms({
                            ...detailedPerms, 
                            ardoise: {...ardoisePerms, ventes: {...ventesPerms, mode: 'modifier'}}
                          })}
                        >
                          <Text style={[styles.modeOptionText, ventesPerms.mode === 'modifier' && { color: '#fff' }]}>✏️ Modifier</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
                
                {/* RAPPORTS */}
                <View style={[styles.permSectionBox, { borderColor: primaryColor + '30', marginBottom: 16 }]}>
                  <Text style={[styles.permGroupTitle, { color: primaryColor, marginBottom: 8 }]}>📊 Rapports</Text>
                  <PermToggle 
                    label="Accès à l'onglet Rapports" 
                    value={rapportsPerms.acces} 
                    onChange={(v) => setDetailedPerms({
                      ...detailedPerms, 
                      ardoise: {...ardoisePerms, rapports: {...rapportsPerms, acces: v}}
                    })} 
                  />
                  {rapportsPerms.acces && (
                    <>
                      <View style={styles.modeSelector}>
                        <Text style={[styles.modeSelectorLabel, { color: primaryColor }]}>Mode d'accès:</Text>
                        <View style={styles.modeOptions}>
                          <TouchableOpacity 
                            style={[styles.modeOption, rapportsPerms.mode === 'lecture' && { backgroundColor: primaryColor }]}
                            onPress={() => setDetailedPerms({
                              ...detailedPerms, 
                              ardoise: {...ardoisePerms, rapports: {...rapportsPerms, mode: 'lecture'}}
                            })}
                          >
                            <Text style={[styles.modeOptionText, rapportsPerms.mode === 'lecture' && { color: '#fff' }]}>👁️ Lecture seule</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.modeOption, rapportsPerms.mode === 'modifier' && { backgroundColor: primaryColor }]}
                            onPress={() => setDetailedPerms({
                              ...detailedPerms, 
                              ardoise: {...ardoisePerms, rapports: {...rapportsPerms, mode: 'modifier'}}
                            })}
                          >
                            <Text style={[styles.modeOptionText, rapportsPerms.mode === 'modifier' && { color: '#fff' }]}>✏️ Modifier</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      
                      <Text style={[styles.modeSelectorLabel, { color: primaryColor, marginTop: 12 }]}>Export:</Text>
                      <View style={styles.exportOptions}>
                        <PermToggle 
                          label="Export PDF" 
                          value={rapportsPerms.export_pdf} 
                          onChange={(v) => setDetailedPerms({
                            ...detailedPerms, 
                            ardoise: {...ardoisePerms, rapports: {...rapportsPerms, export_pdf: v}}
                          })} 
                          icon="📄"
                        />
                        <PermToggle 
                          label="Export Excel" 
                          value={rapportsPerms.export_excel} 
                          onChange={(v) => setDetailedPerms({
                            ...detailedPerms, 
                            ardoise: {...ardoisePerms, rapports: {...rapportsPerms, export_excel: v}}
                          })} 
                          icon="📊"
                        />
                      </View>
                    </>
                  )}
                </View>
                
              </View>
            )}
          </View>
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.screenContainer}>
      <ScrollView>
        <Text style={[styles.screenTitle, { color: primaryColor }]}>Équipe</Text>
        <View style={styles.usersList}>
          {(users || []).map((u: User) => (
            <View key={u.user_id} style={[styles.userItem, { overflow: 'visible' }]}>
              <View style={styles.userItemLeft}>
                <View style={[styles.userAvatar, { backgroundColor: u.role === 'admin' ? primaryColor : '#888' }]}><WebIcon name={u.role === 'admin' ? 'key' : 'person'} size={20} color={secondaryColor} /></View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName2, { color: primaryColor }]}>{u.name}</Text>
                  <Text style={styles.userEmail}>{u.email}</Text>
                  {u.role === 'staff' && (
                    <View style={styles.permissionBadges}>
                      <Text style={[styles.permissionBadge, { backgroundColor: `${primaryColor}20`, color: primaryColor }]}>
                        {getPermissionSummary(u)}
                      </Text>
                    </View>
                  )}
                  {u.role === 'staff' && (u.assigned_categories || []).length > 0 && <Text style={styles.userCategories}>{getCategoryNames(u.assigned_categories)}</Text>}
                  <Text style={[styles.userRoleText, { color: u.role === 'admin' ? primaryColor : '#666' }]}>{u.role === 'admin' ? '👑 Manager' : '👤 Personnel'}</Text>
                </View>
              </View>
              {u.role !== 'admin' && (
                <TouchableOpacity 
                  style={[styles.userActionButton, { backgroundColor: primaryColor, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
                  onPress={() => setShowActionsMenu(u.user_id)}
                  data-testid={`edit-menu-btn-${u.user_id}`}
                >
                  <WebIcon name="create-outline" size={18} color={secondaryColor} />
                  <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 14 }}>Modifier</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
      <TouchableOpacity style={[styles.addButton, { backgroundColor: primaryColor }]} onPress={() => setShowAddModal(true)}><WebIcon name="add" size={32} color={secondaryColor} /></TouchableOpacity>

      {/* Modal Menu d'actions pour un utilisateur */}
      <Modal visible={!!showActionsMenu} animationType="fade" transparent>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setShowActionsMenu(null)}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '85%', maxWidth: 320, overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ backgroundColor: primaryColor, padding: 16, alignItems: 'center' }}>
              <Text style={{ color: secondaryColor, fontSize: 16, fontWeight: 'bold' }}>
                {(users || []).find((u: User) => u.user_id === showActionsMenu)?.name || 'Utilisateur'}
              </Text>
              <Text style={{ color: secondaryColor, opacity: 0.8, fontSize: 12, marginTop: 2 }}>
                {(users || []).find((u: User) => u.user_id === showActionsMenu)?.email || ''}
              </Text>
            </View>
            
            {/* Options */}
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
              onPress={() => { 
                const user = (users || []).find((u: User) => u.user_id === showActionsMenu);
                if (user) { setEditUserName(user.name); setEditUserEmail(user.email); setShowEditUserModal(user); }
                setShowActionsMenu(null); 
              }}
              data-testid="action-edit-info"
            >
              <WebIcon name="person-outline" size={22} color="#2196F3" />
              <Text style={{ marginLeft: 14, color: '#333', fontSize: 16 }}>Modifier les infos</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
              onPress={() => { 
                const user = (users || []).find((u: User) => u.user_id === showActionsMenu);
                console.log('[PERMISSIONS] Opening for user:', user?.name, user?.user_id);
                setShowActionsMenu(null);
                if (user) {
                  // Utiliser setTimeout pour s'assurer que le modal d'actions est fermé avant d'ouvrir le modal de permissions
                  setTimeout(() => {
                    openPermissionsModal(user);
                  }, 100);
                }
              }}
              data-testid="action-permissions"
            >
              <WebIcon name="shield-checkmark-outline" size={22} color={primaryColor} />
              <Text style={{ marginLeft: 14, color: '#333', fontSize: 16 }}>Gérer les permissions</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#e8f5e9' }}
              onPress={() => { 
                const user = (users || []).find((u: User) => u.user_id === showActionsMenu);
                if (user) grantFullAccess(user.user_id, user.name);
                setShowActionsMenu(null); 
              }}
              data-testid="action-full-access"
            >
              <WebIcon name="checkmark-circle-outline" size={22} color="#4caf50" />
              <Text style={{ marginLeft: 14, color: '#4caf50', fontSize: 16, fontWeight: '600' }}>Donner tous les accès</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
              onPress={() => { 
                setShowResetModal(showActionsMenu); 
                setShowActionsMenu(null); 
              }}
              data-testid="action-reset-pwd"
            >
              <WebIcon name="key-outline" size={22} color="#ff9800" />
              <Text style={{ marginLeft: 14, color: '#333', fontSize: 16 }}>Réinitialiser le mot de passe</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
              onPress={() => { 
                const user = (users || []).find((u: User) => u.user_id === showActionsMenu);
                if (user) deleteUser(user.user_id, user.name);
                setShowActionsMenu(null); 
              }}
              data-testid="action-delete"
            >
              <WebIcon name="trash-outline" size={22} color="#ff4444" />
              <Text style={{ marginLeft: 14, color: '#ff4444', fontSize: 16 }}>Supprimer</Text>
            </TouchableOpacity>
            
            {/* Bouton Annuler */}
            <TouchableOpacity 
              style={{ padding: 16, backgroundColor: '#f5f5f5', alignItems: 'center' }}
              onPress={() => setShowActionsMenu(null)}
            >
              <Text style={{ color: '#666', fontSize: 16, fontWeight: '600' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add User Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor }]}>
              <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: primaryColor }]}>Nouveau membre</Text><TouchableOpacity onPress={() => setShowAddModal(false)}><WebIcon name="close" size={28} color={primaryColor} /></TouchableOpacity></View>
              <ScrollView style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom *</Text>
                <TextInput style={[styles.modalInput, { borderColor: primaryColor }]} placeholder="Nom" value={newUserName} onChangeText={setNewUserName} />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Email *</Text>
                <TextInput style={[styles.modalInput, { borderColor: primaryColor }]} placeholder="email@exemple.com" value={newUserEmail} onChangeText={setNewUserEmail} keyboardType="email-address" autoCapitalize="none" />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Mot de passe *</Text>
                <TextInput style={[styles.modalInput, { borderColor: primaryColor }]} placeholder="Mot de passe" value={newUserPassword} onChangeText={setNewUserPassword} secureTextEntry />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Catégories (pour les tâches)</Text>
                <View style={styles.categoryCheckboxList}>
                  {categories.map((category: Category) => (
                    <TouchableOpacity key={category.category_id} style={styles.categoryCheckboxItem} onPress={() => toggleCategory(category.category_id)}>
                      <View style={[styles.categoryCheckbox, { borderColor: primaryColor }, newUserCategories.includes(category.category_id) && { backgroundColor: primaryColor }]}>
                        {newUserCategories.includes(category.category_id) && <WebIcon name="checkmark" size={16} color={secondaryColor} />}
                      </View>
                      <Text style={styles.categoryCheckboxLabel}>{category.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} onPress={addUser} disabled={isAdding}>
                  {isAdding ? <ActivityIndicator color={secondaryColor} /> : <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Créer</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!showResetModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor }]}>
            <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: primaryColor }]}>Réinitialiser MDP</Text><TouchableOpacity onPress={() => { setShowResetModal(null); setNewPassword(''); }}><WebIcon name="close" size={28} color={primaryColor} /></TouchableOpacity></View>
            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Nouveau mot de passe</Text>
              <TextInput style={[styles.modalInput, { borderColor: primaryColor }]} placeholder="Nouveau mot de passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
              <TouchableOpacity style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} onPress={resetPassword}><Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Réinitialiser</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Permissions Modal - Nouveau système avec onglets */}
      <Modal visible={!!showPermissionsModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '95%', maxWidth: 900 }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxHeight: '85%', borderRadius: 16 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Permissions</Text>
                <TouchableOpacity onPress={() => setShowPermissionsModal(null)}><WebIcon name="close" size={28} color={primaryColor} /></TouchableOpacity>
              </View>
              
              {showPermissionsModal && (
                <>
                  {/* User Header */}
                  <View style={styles.permUserHeader}>
                    <View style={[styles.userAvatar, { backgroundColor: '#888' }]}>
                      <WebIcon name="person" size={24} color={secondaryColor} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={[styles.editUserName, { color: primaryColor }]}>{showPermissionsModal.name}</Text>
                      <Text style={styles.editUserEmail}>{showPermissionsModal.email}</Text>
                    </View>
                  </View>
                  
                  {/* Tabs Navigation */}
                  <View style={styles.permTabsContainer}>
                    {[0, 1, 2, 3, 4].map((tab) => (
                      <TouchableOpacity 
                        key={tab} 
                        style={[styles.permTab, permissionsTab === tab && { backgroundColor: primaryColor }]}
                        onPress={() => setPermissionsTab(tab)}
                      >
                        <Text style={[styles.permTabText, permissionsTab === tab && { color: secondaryColor }]}>{tab + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Tab Content */}
                  <ScrollView style={[styles.modalBody, { flex: 1, maxHeight: 400 }]} showsVerticalScrollIndicator={true}>
                    {renderPermissionsPage()}
                  </ScrollView>
                  
                  {/* Navigation Buttons - Outside ScrollView */}
                  <View style={[styles.permNavButtons, { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0' }]}>
                    {permissionsTab > 0 && (
                      <TouchableOpacity 
                        style={[styles.permNavBtn, { borderColor: primaryColor }]} 
                        onPress={() => setPermissionsTab(permissionsTab - 1)}
                      >
                        <WebIcon name="chevron-back" size={20} color={primaryColor} />
                        <Text style={[styles.permNavBtnText, { color: primaryColor }]}>Précédent</Text>
                      </TouchableOpacity>
                    )}
                    {permissionsTab < 4 ? (
                      <TouchableOpacity 
                        style={[styles.permNavBtn, styles.permNavBtnNext, { backgroundColor: primaryColor }]} 
                        onPress={() => setPermissionsTab(permissionsTab + 1)}
                      >
                        <Text style={[styles.permNavBtnText, { color: secondaryColor }]}>Suivant</Text>
                        <WebIcon name="chevron-forward" size={20} color={secondaryColor} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={[styles.permNavBtn, styles.permNavBtnNext, { backgroundColor: primaryColor }]} 
                        onPress={savePermissions}
                        disabled={isSavingPermissions}
                      >
                        {isSavingPermissions ? (
                          <ActivityIndicator color={secondaryColor} />
                        ) : (
                          <>
                            <WebIcon name="checkmark" size={20} color={secondaryColor} />
                            <Text style={[styles.permNavBtnText, { color: secondaryColor }]}>Enregistrer</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Edit User Modal */}
      <Modal visible={showEditUserModal !== null} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>✏️ Modifier le membre</Text>
            
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 6 }}>Nom</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 }}
              placeholder="Nom du membre"
              value={editUserName}
              onChangeText={setEditUserName}
            />
            
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 6 }}>Adresse email</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 20 }}
              placeholder="Email"
              value={editUserEmail}
              onChangeText={setEditUserEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 16, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' }}
                onPress={() => setShowEditUserModal(null)}
              >
                <Text style={{ fontWeight: '600', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 16, borderRadius: 10, backgroundColor: primaryColor, alignItems: 'center' }}
                onPress={async () => {
                  if (!showEditUserModal) return;
                  setIsEditingUser(true);
                  try {
                    await apiRequest(`/users/${showEditUserModal.user_id}`, {
                      method: 'PUT',
                      body: JSON.stringify({ name: editUserName, email: editUserEmail })
                    });
                    loadUsers();
                    setShowEditUserModal(null);
                  } catch (error) {
                    console.error('Error updating user:', error);
                  }
                  setIsEditingUser(false);
                }}
                disabled={isEditingUser}
              >
                <Text style={{ fontWeight: '600', color: secondaryColor }}>{isEditingUser ? '⏳...' : '💾 Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== SUPER ADMIN SCREEN ====================
function SuperAdminScreen({ restaurants, users, stats, apiRequest, loadData }: any) {
  const [activeTab, setActiveTab] = useState<'restaurants' | 'users' | 'stats'>('restaurants');
  const [showCreateRestaurantModal, setShowCreateRestaurantModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<any>(null);
  const [selectedRestaurantFilter, setSelectedRestaurantFilter] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form pour créer un restaurant
  const [newRestaurant, setNewRestaurant] = useState({
    name: '',
    admin_email: '',
    admin_password: '',
    admin_name: '',
    description: ''
  });
  
  // Form pour reset password
  const [newPassword, setNewPassword] = useState('');

  const PRIMARY = '#26252D';
  const SECONDARY = '#F5F0E8';

  const handleCreateRestaurant = async () => {
    if (!newRestaurant.name || !newRestaurant.admin_email || !newRestaurant.admin_password || !newRestaurant.admin_name) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest('/superadmin/restaurants', {
        method: 'POST',
        body: JSON.stringify(newRestaurant)
      });
      setShowCreateRestaurantModal(false);
      setNewRestaurant({ name: '', admin_email: '', admin_password: '', admin_name: '', description: '' });
      await loadData();
      alert('Restaurant créé avec succès !');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest(`/superadmin/users/${showResetPasswordModal.user_id}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ new_password: newPassword })
      });
      setShowResetPasswordModal(null);
      setNewPassword('');
      alert('Mot de passe réinitialisé avec succès !');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRestaurant = async (restaurantId: string, restaurantName: string) => {
    const confirmed = await showConfirm(`Supprimer définitivement le restaurant "${restaurantName}" et tous ses utilisateurs ?`);
    if (!confirmed) return;
    
    try {
      await apiRequest(`/superadmin/restaurants/${restaurantId}`, { method: 'DELETE' });
      await loadData();
      alert('Restaurant supprimé avec succès');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const filteredUsers = selectedRestaurantFilter 
    ? (users || []).filter((u: any) => u.restaurant_id === selectedRestaurantFilter)
    : (users || []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: SECONDARY }}>
      {/* Header */}
      <View style={{ backgroundColor: PRIMARY, padding: 20, paddingTop: 40 }}>
        <Text style={{ color: SECONDARY, fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>🛡️ Super Admin</Text>
        <Text style={{ color: SECONDARY, fontSize: 14, textAlign: 'center', opacity: 0.8, marginTop: 4 }}>Gestion de la plateforme NeoChef</Text>
      </View>

      {/* Stats rapides */}
      {stats && (
        <View style={{ flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: PRIMARY }}>{stats.total_restaurants}</Text>
            <Text style={{ fontSize: 12, color: '#666' }}>Restaurants</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: PRIMARY }}>{stats.total_users}</Text>
            <Text style={{ fontSize: 12, color: '#666' }}>Utilisateurs</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: PRIMARY }}>{stats.sessions_last_24h}</Text>
            <Text style={{ fontSize: 12, color: '#666' }}>Connexions 24h</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' }}>
        <TouchableOpacity 
          style={{ flex: 1, padding: 14, borderBottomWidth: 2, borderBottomColor: activeTab === 'restaurants' ? PRIMARY : 'transparent' }}
          onPress={() => setActiveTab('restaurants')}
        >
          <Text style={{ textAlign: 'center', color: activeTab === 'restaurants' ? PRIMARY : '#888', fontWeight: '600' }}>Restaurants</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ flex: 1, padding: 14, borderBottomWidth: 2, borderBottomColor: activeTab === 'users' ? PRIMARY : 'transparent' }}
          onPress={() => setActiveTab('users')}
        >
          <Text style={{ textAlign: 'center', color: activeTab === 'users' ? PRIMARY : '#888', fontWeight: '600' }}>Utilisateurs</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {activeTab === 'restaurants' && (
          <>
            {/* Bouton créer */}
            <TouchableOpacity 
              style={{ backgroundColor: '#2E7D32', padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}
              onPress={() => setShowCreateRestaurantModal(true)}
            >
              <WebIcon name="add-circle-outline" size={22} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Créer un nouveau restaurant</Text>
            </TouchableOpacity>

            {/* Liste des restaurants */}
            {restaurants.map((r: any) => (
              <View key={r.restaurant_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: PRIMARY }}>{r.name}</Text>
                    {r.description && <Text style={{ color: '#666', marginTop: 4 }}>{r.description}</Text>}
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleDeleteRestaurant(r.restaurant_id, r.name)}
                    style={{ padding: 8 }}
                  >
                    <WebIcon name="trash-outline" size={20} color="#ff4444" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <WebIcon name="people-outline" size={16} color="#666" />
                    <Text style={{ color: '#666', marginLeft: 4, fontSize: 13 }}>{r.user_count || 0} utilisateurs</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <WebIcon name="time-outline" size={16} color="#666" />
                    <Text style={{ color: '#666', marginLeft: 4, fontSize: 13 }}>Dernière activité: {formatDate(r.last_activity)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {activeTab === 'users' && (
          <>
            {/* Filtre par restaurant */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: PRIMARY, fontWeight: '600', marginBottom: 8 }}>Filtrer par restaurant:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity 
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: !selectedRestaurantFilter ? PRIMARY : '#eee' }}
                  onPress={() => setSelectedRestaurantFilter('')}
                >
                  <Text style={{ color: !selectedRestaurantFilter ? SECONDARY : '#666', fontSize: 13 }}>Tous</Text>
                </TouchableOpacity>
                {restaurants.map((r: any) => (
                  <TouchableOpacity 
                    key={r.restaurant_id}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedRestaurantFilter === r.restaurant_id ? PRIMARY : '#eee' }}
                    onPress={() => setSelectedRestaurantFilter(r.restaurant_id)}
                  >
                    <Text style={{ color: selectedRestaurantFilter === r.restaurant_id ? SECONDARY : '#666', fontSize: 13 }}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Liste des utilisateurs */}
            {filteredUsers.map((u: any) => (
              <View key={u.user_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: u.role === 'admin' ? PRIMARY : '#888', justifyContent: 'center', alignItems: 'center' }}>
                  <WebIcon name={u.role === 'admin' ? 'key' : 'person'} size={20} color={SECONDARY} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontWeight: '600', color: PRIMARY }}>{u.name}</Text>
                  <Text style={{ color: '#666', fontSize: 13 }}>{u.email}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>{u.restaurant_name} • {u.role === 'admin' ? 'Admin' : 'Personnel'}</Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setShowResetPasswordModal(u)}
                  style={{ backgroundColor: '#ff9800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                >
                  <WebIcon name="key-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Modal Créer Restaurant */}
      <Modal visible={showCreateRestaurantModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, maxHeight: '85%' }}>
            <View style={{ backgroundColor: PRIMARY, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: SECONDARY, fontSize: 18, fontWeight: 'bold' }}>Nouveau Restaurant</Text>
              <TouchableOpacity onPress={() => setShowCreateRestaurantModal(false)}>
                <WebIcon name="close" size={24} color={SECONDARY} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={{ color: PRIMARY, fontWeight: '600', marginBottom: 6 }}>Nom du restaurant *</Text>
              <TextInput
                value={newRestaurant.name}
                onChangeText={(t) => setNewRestaurant({ ...newRestaurant, name: t })}
                placeholder="Ex: Le Cercle"
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }}
              />
              
              <Text style={{ color: PRIMARY, fontWeight: '600', marginBottom: 6 }}>Description</Text>
              <TextInput
                value={newRestaurant.description}
                onChangeText={(t) => setNewRestaurant({ ...newRestaurant, description: t })}
                placeholder="Description du restaurant (optionnel)"
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }}
              />
              
              <View style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ color: PRIMARY, fontWeight: 'bold', marginBottom: 12 }}>Compte Admin du restaurant</Text>
                
                <Text style={{ color: PRIMARY, fontWeight: '600', marginBottom: 6 }}>Nom de l'admin *</Text>
                <TextInput
                  value={newRestaurant.admin_name}
                  onChangeText={(t) => setNewRestaurant({ ...newRestaurant, admin_name: t })}
                  placeholder="Ex: Jean Dupont"
                  style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#fff' }}
                />
                
                <Text style={{ color: PRIMARY, fontWeight: '600', marginBottom: 6 }}>Email de l'admin *</Text>
                <TextInput
                  value={newRestaurant.admin_email}
                  onChangeText={(t) => setNewRestaurant({ ...newRestaurant, admin_email: t })}
                  placeholder="admin@restaurant.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#fff' }}
                />
                
                <Text style={{ color: PRIMARY, fontWeight: '600', marginBottom: 6 }}>Mot de passe *</Text>
                <TextInput
                  value={newRestaurant.admin_password}
                  onChangeText={(t) => setNewRestaurant({ ...newRestaurant, admin_password: t })}
                  placeholder="Mot de passe (min. 6 caractères)"
                  secureTextEntry
                  style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#fff' }}
                />
              </View>
              
              <View style={{ height: 20 }} />
            </ScrollView>
            <View style={{ flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#eee', marginRight: 8, alignItems: 'center' }}
                onPress={() => setShowCreateRestaurantModal(false)}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#2E7D32', marginLeft: 8, alignItems: 'center' }}
                onPress={handleCreateRestaurant}
                disabled={isSubmitting}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{isSubmitting ? 'Création...' : 'Créer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Reset Password */}
      <Modal visible={showResetPasswordModal !== null} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: PRIMARY, marginBottom: 8 }}>Réinitialiser le mot de passe</Text>
            {showResetPasswordModal && (
              <Text style={{ color: '#666', marginBottom: 16 }}>Utilisateur: {showResetPasswordModal.name} ({showResetPasswordModal.email})</Text>
            )}
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Nouveau mot de passe"
              secureTextEntry
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center' }}
                onPress={() => { setShowResetPasswordModal(null); setNewPassword(''); }}
              >
                <Text style={{ color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#ff9800', alignItems: 'center' }}
                onPress={handleResetPassword}
                disabled={isSubmitting}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{isSubmitting ? '...' : 'Réinitialiser'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== SETTINGS SCREEN ====================
function SettingsScreen({ restaurant, primaryColor, secondaryColor, apiRequest, onUpdate, onNavigateToCategories, onNavigateToUsers, currentUser }: any) {
  const [name, setName] = useState(restaurant.name);
  const [description, setDescription] = useState(restaurant.description || 'Gestion des tâches cuisine');
  const [primary, setPrimary] = useState(restaurant.primary_color);
  const [secondary, setSecondary] = useState(restaurant.secondary_color);
  // Nouveaux champs d'information restaurant
  const [addressStreet, setAddressStreet] = useState(restaurant.address_street || '');
  const [addressPostalCode, setAddressPostalCode] = useState(restaurant.address_postal_code || '');
  const [addressCity, setAddressCity] = useState(restaurant.address_city || '');
  const [email, setEmail] = useState(restaurant.email || '');
  const [phone, setPhone] = useState(restaurant.phone || '');
  // Champs légaux
  const [siret, setSiret] = useState(restaurant.siret || '');
  const [rcs, setRcs] = useState(restaurant.rcs || '');
  // Réseaux sociaux
  const [facebookUrl, setFacebookUrl] = useState(restaurant.facebook_url || '');
  const [instagramUrl, setInstagramUrl] = useState(restaurant.instagram_url || '');
  // WiFi
  const [wifiName, setWifiName] = useState(restaurant.wifi_name || '');
  const [wifiPassword, setWifiPassword] = useState(restaurant.wifi_password || '');
  // Happy Hour
  const [happyHourEnabled, setHappyHourEnabled] = useState(restaurant.happy_hour_enabled || false);
  const [happyHourStart, setHappyHourStart] = useState(restaurant.happy_hour_start || '17:00');
  const [happyHourEnd, setHappyHourEnd] = useState(restaurant.happy_hour_end || '20:00');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  
  // Mon compte - Changement email/mot de passe
  const [showAccountSection, setShowAccountSection] = useState(false);
  const [newEmail, setNewEmail] = useState(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  
  // Fonction pour changer l'email
  const handleChangeEmail = async () => {
    if (!newEmail || newEmail === currentUser?.email) {
      showAlert('Info', 'Aucun changement d\'email détecté');
      return;
    }
    if (!currentPassword) {
      showAlert('Erreur', 'Veuillez entrer votre mot de passe actuel');
      return;
    }
    setIsSavingAccount(true);
    try {
      await apiRequest(`/users/${currentUser.user_id}/change-email`, {
        method: 'PUT',
        body: JSON.stringify({ new_email: newEmail, current_password: currentPassword })
      });
      showAlert('Succès', 'Email mis à jour avec succès');
      setCurrentPassword('');
    } catch (error: any) {
      showAlert('Erreur', error.message || 'Erreur lors du changement d\'email');
    } finally {
      setIsSavingAccount(false);
    }
  };
  
  // Fonction pour changer le mot de passe
  const handleChangePassword = async () => {
    if (!currentPassword) {
      showAlert('Erreur', 'Veuillez entrer votre mot de passe actuel');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showAlert('Erreur', 'Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showAlert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }
    setIsSavingAccount(true);
    try {
      await apiRequest(`/users/${currentUser.user_id}/change-password`, {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      showAlert('Succès', 'Mot de passe mis à jour avec succès');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      showAlert('Erreur', error.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission requise', 'Nous avons besoin d\'accéder à vos photos'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      setIsUploadingLogo(true);
      try { 
        const updated = await apiRequest(`/restaurants/${restaurant.restaurant_id}`, { method: 'PUT', body: JSON.stringify({ logo_base64: result.assets[0].base64 }) }); 
        onUpdate(updated); 
        // Update cache for login screen
        await AsyncStorage.setItem('restaurant_branding', JSON.stringify({
          name: updated.name,
          description: updated.description || 'Gestion des tâches cuisine',
          logo_base64: updated.logo_base64,
          primary_color: updated.primary_color,
          secondary_color: updated.secondary_color
        }));
        showAlert('Succès', 'Logo mis à jour'); 
      }
      catch (error: any) { showAlert('Erreur', error.message); }
      finally { setIsUploadingLogo(false); }
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try { 
      const updated = await apiRequest(`/restaurants/${restaurant.restaurant_id}`, { method: 'PUT', body: JSON.stringify({ 
        name, 
        description, 
        primary_color: primary, 
        secondary_color: secondary,
        address_street: addressStreet || null,
        address_postal_code: addressPostalCode || null,
        address_city: addressCity || null,
        email: email || null,
        phone: phone || null,
        siret: siret || null,
        rcs: rcs || null,
        facebook_url: facebookUrl || null,
        instagram_url: instagramUrl || null,
        wifi_name: wifiName || null,
        wifi_password: wifiPassword || null,
        happy_hour_enabled: happyHourEnabled,
        happy_hour_start: happyHourStart || null,
        happy_hour_end: happyHourEnd || null
      }) }); 
      onUpdate(updated); 
      // Update cache for login screen
      await AsyncStorage.setItem('restaurant_branding', JSON.stringify({
        name: updated.name,
        description: updated.description || 'Gestion des tâches cuisine',
        logo_base64: updated.logo_base64,
        primary_color: updated.primary_color,
        secondary_color: updated.secondary_color
      }));
      showAlert('Succès', 'Paramètres enregistrés'); 
    }
    catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsSaving(false); }
  };

  const colorPresets = [
    { primary: '#26252D', secondary: '#EAE6CA', name: 'Classique' },
    { primary: '#1a472a', secondary: '#f5f5dc', name: 'Forêt' },
    { primary: '#2c3e50', secondary: '#ecf0f1', name: 'Ocean' },
    { primary: '#8b0000', secondary: '#fff8dc', name: 'Bordeaux' },
  ];

  return (
    <ScrollView style={styles.screenContainer}>
      <Text style={[styles.screenTitle, { color: primaryColor }]}>Paramètres</Text>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Logo du restaurant</Text>
        <TouchableOpacity style={styles.logoUploadButton} onPress={pickImage} disabled={isUploadingLogo}>
          {isUploadingLogo ? <ActivityIndicator color={primaryColor} /> : restaurant.logo_base64 ? (
            <Image source={{ uri: `data:image/png;base64,${restaurant.logo_base64}` }} style={styles.logoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}><WebIcon name="camera-outline" size={40} color="#999" /><Text style={styles.logoPlaceholderText}>Ajouter un logo</Text></View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Nom du restaurant</Text>
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor }]} value={name} onChangeText={setName} />
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Description (sous-titre)</Text>
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor }]} value={description} onChangeText={setDescription} placeholder="Ex: Gestion des tâches cuisine" />
      </View>

      {/* Informations de contact du restaurant */}
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Adresse du restaurant</Text>
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor, marginBottom: 8 }]} value={addressStreet} onChangeText={setAddressStreet} placeholder="Rue" />
        <View style={{ flexDirection: 'row' }}>
          <TextInput style={[styles.settingsInput, { borderColor: primaryColor, flex: 1, marginRight: 8 }]} value={addressPostalCode} onChangeText={setAddressPostalCode} placeholder="Code postal" keyboardType="numeric" />
          <TextInput style={[styles.settingsInput, { borderColor: primaryColor, flex: 2 }]} value={addressCity} onChangeText={setAddressCity} placeholder="Ville" />
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Contact</Text>
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor, marginBottom: 8 }]} value={email} onChangeText={setEmail} placeholder="Email du restaurant" keyboardType="email-address" />
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor }]} value={phone} onChangeText={setPhone} placeholder="Téléphone" keyboardType="phone-pad" />
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Informations légales (pour factures)</Text>
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor, marginBottom: 8 }]} value={siret} onChangeText={setSiret} placeholder="Numéro SIRET" keyboardType="numeric" />
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor }]} value={rcs} onChangeText={setRcs} placeholder="RCS (ex: Paris B 123 456 789)" />
      </View>

      {/* Réseaux sociaux */}
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Réseaux sociaux</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <WebIcon name="logo-facebook" size={20} color="#1877F2" style={{ marginRight: 10 }} />
          <TextInput style={[styles.settingsInput, { borderColor: primaryColor, flex: 1 }]} value={facebookUrl} onChangeText={setFacebookUrl} placeholder="URL Facebook" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <WebIcon name="logo-instagram" size={20} color="#E4405F" style={{ marginRight: 10 }} />
          <TextInput style={[styles.settingsInput, { borderColor: primaryColor, flex: 1 }]} value={instagramUrl} onChangeText={setInstagramUrl} placeholder="URL Instagram" />
        </View>
      </View>

      {/* WiFi */}
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>WiFi (pour les clients)</Text>
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor, marginBottom: 8 }]} value={wifiName} onChangeText={setWifiName} placeholder="Nom du réseau WiFi" />
        <TextInput style={[styles.settingsInput, { borderColor: primaryColor }]} value={wifiPassword} onChangeText={setWifiPassword} placeholder="Mot de passe WiFi" />
      </View>

      {/* Happy Hour */}
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Happy Hour</Text>
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
          onPress={() => setHappyHourEnabled(!happyHourEnabled)}
        >
          <WebIcon 
            name={happyHourEnabled ? 'checkbox' : 'square-outline'} 
            size={24} 
            color={happyHourEnabled ? '#FF6B35' : '#666'} 
          />
          <Text style={{ marginLeft: 10, color: happyHourEnabled ? '#FF6B35' : '#666', fontWeight: happyHourEnabled ? 'bold' : 'normal' }}>
            Activer Happy Hour
          </Text>
        </TouchableOpacity>
        {happyHourEnabled && (
          <View>
            <Text style={{ color: '#666', marginBottom: 8, fontSize: 13 }}>Horaires Happy Hour (les prix Happy Hour s'afficheront automatiquement)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: '#666' }}>De</Text>
              <TextInput 
                style={[styles.settingsInput, { borderColor: '#FF6B35', width: 80, textAlign: 'center' }]} 
                value={happyHourStart} 
                onChangeText={setHappyHourStart} 
                placeholder="17:00" 
              />
              <Text style={{ color: '#666' }}>à</Text>
              <TextInput 
                style={[styles.settingsInput, { borderColor: '#FF6B35', width: 80, textAlign: 'center' }]} 
                value={happyHourEnd} 
                onChangeText={setHappyHourEnd} 
                placeholder="20:00" 
              />
            </View>
          </View>
        )}
      </View>

      {/* Section Lien Client / QR Code */}
      <View style={[styles.settingsSection, { backgroundColor: '#f0f8ff', padding: 16, borderRadius: 12 }]}>
        <Text style={[styles.settingsLabel, { color: primaryColor, marginBottom: 12 }]}>📱 Vue Client (Menu Digital)</Text>
        
        {/* Lien copiable */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#666', marginBottom: 8, fontSize: 13 }}>Lien à intégrer sur votre site web :</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput 
              style={{ 
                flex: 1, 
                backgroundColor: '#fff', 
                borderWidth: 1, 
                borderColor: '#ddd', 
                borderRadius: 8, 
                padding: 10,
                fontSize: 12,
                color: '#333'
              }} 
              value={`${API_BASE_URL}/client/${restaurant.restaurant_id}`}
              editable={false}
              selectTextOnFocus={true}
            />
            <TouchableOpacity 
              style={{ 
                backgroundColor: primaryColor, 
                paddingHorizontal: 16, 
                paddingVertical: 10, 
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6
              }}
              onPress={async () => {
                await Clipboard.setStringAsync(`${API_BASE_URL}/client/${restaurant.restaurant_id}`);
                showAlert('Copié !', 'Le lien a été copié dans le presse-papier.');
              }}
            >
              <WebIcon name="copy-outline" size={18} color={secondaryColor} />
              <Text style={{ color: secondaryColor, fontWeight: '600' }}>Copier</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QR Code */}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#666', marginBottom: 12, fontSize: 13 }}>QR Code à scanner par vos clients :</Text>
          <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
            <QRCode 
              value={`${API_BASE_URL}/client/${restaurant.restaurant_id}`}
              size={180}
              color={primaryColor}
              backgroundColor="#fff"
            />
          </View>
          <Text style={{ color: '#888', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
            Scannez ce code pour accéder au menu digital
          </Text>
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Thèmes prédéfinis</Text>
        <View style={styles.colorPresets}>
          {colorPresets.map((preset, index) => (
            <TouchableOpacity key={index} style={[styles.colorPreset, primary === preset.primary && secondary === preset.secondary && styles.colorPresetSelected]} onPress={() => { setPrimary(preset.primary); setSecondary(preset.secondary); }}>
              <View style={styles.colorPresetPreview}><View style={[styles.colorPresetPrimary, { backgroundColor: preset.primary }]} /><View style={[styles.colorPresetSecondary, { backgroundColor: preset.secondary }]} /></View>
              <Text style={styles.colorPresetName}>{preset.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: primaryColor }]}>Couleurs personnalisées</Text>
        <View style={styles.colorInputRow}>
          <Text style={styles.colorInputLabel}>Couleur principale:</Text>
          <TextInput style={[styles.colorInput, { borderColor: primaryColor }]} value={primary} onChangeText={setPrimary} placeholder="#000000" />
          <View style={[styles.colorPreviewBox, { backgroundColor: primary }]} />
        </View>
        <View style={styles.colorInputRow}>
          <Text style={styles.colorInputLabel}>Couleur secondaire:</Text>
          <TextInput style={[styles.colorInput, { borderColor: primaryColor }]} value={secondary} onChangeText={setSecondary} placeholder="#FFFFFF" />
          <View style={[styles.colorPreviewBox, { backgroundColor: secondary }]} />
        </View>
        <Text style={styles.colorHint}>Format: #RRGGBB (ex: #26252D)</Text>
      </View>

      {/* Section Mon Compte */}
      <View style={[styles.settingsSection, { backgroundColor: '#fff8e1', padding: 16, borderRadius: 12 }]}>
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          onPress={() => setShowAccountSection(!showAccountSection)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <WebIcon name="person-circle" size={24} color="#f57c00" />
            <Text style={{ color: '#f57c00', fontWeight: 'bold', fontSize: 16 }}>Mon compte</Text>
          </View>
          <WebIcon name={showAccountSection ? 'chevron-up' : 'chevron-down'} size={20} color="#f57c00" />
        </TouchableOpacity>
        
        {showAccountSection && (
          <View style={{ marginTop: 16 }}>
            {/* Email actuel */}
            <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Email actuel</Text>
              <Text style={{ color: '#333', fontWeight: '600' }}>{currentUser?.email || 'Non défini'}</Text>
            </View>
            
            {/* Changer l'email */}
            <Text style={{ color: '#f57c00', fontWeight: '600', marginBottom: 8 }}>Changer mon email</Text>
            <TextInput 
              style={[styles.settingsInput, { borderColor: '#f57c00', marginBottom: 8 }]} 
              value={newEmail} 
              onChangeText={setNewEmail} 
              placeholder="Nouvel email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            {/* Changer le mot de passe */}
            <Text style={{ color: '#f57c00', fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Changer mon mot de passe</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TextInput 
                style={[styles.settingsInput, { borderColor: '#f57c00', flex: 1, marginBottom: 0 }]} 
                value={currentPassword} 
                onChangeText={setCurrentPassword} 
                placeholder="Mot de passe actuel *"
                secureTextEntry={!showCurrentPassword}
              />
              <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} style={{ padding: 10, marginLeft: -40 }}>
                <WebIcon name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TextInput 
                style={[styles.settingsInput, { borderColor: '#f57c00', flex: 1, marginBottom: 0 }]} 
                value={newPassword} 
                onChangeText={setNewPassword} 
                placeholder="Nouveau mot de passe"
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={{ padding: 10, marginLeft: -40 }}>
                <WebIcon name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            <TextInput 
              style={[styles.settingsInput, { borderColor: '#f57c00', marginBottom: 12 }]} 
              value={confirmNewPassword} 
              onChangeText={setConfirmNewPassword} 
              placeholder="Confirmer le nouveau mot de passe"
              secureTextEntry={!showNewPassword}
            />
            
            {/* Boutons d'action */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: '#f57c00', padding: 14, borderRadius: 8, alignItems: 'center' }}
                onPress={handleChangeEmail}
                disabled={isSavingAccount}
              >
                {isSavingAccount ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Changer email</Text>}
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: '#ff5722', padding: 14, borderRadius: 8, alignItems: 'center' }}
                onPress={handleChangePassword}
                disabled={isSavingAccount}
              >
                {isSavingAccount ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Changer mot de passe</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Bouton Gérer l'équipe */}
      <TouchableOpacity 
        style={{ 
          backgroundColor: '#fff', 
          borderWidth: 2, 
          borderColor: primaryColor, 
          padding: 16, 
          borderRadius: 12, 
          marginBottom: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10
        }} 
        onPress={onNavigateToUsers}
      >
        <WebIcon name="people" size={24} color={primaryColor} />
        <Text style={{ color: primaryColor, fontWeight: 'bold', fontSize: 16 }}>Gérer l'équipe</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveButton, { backgroundColor: primaryColor }]} onPress={saveSettings} disabled={isSaving}>
        {isSaving ? <ActivityIndicator color={secondaryColor} /> : <Text style={[styles.saveButtonText, { color: secondaryColor }]}>Enregistrer</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ==================== PUBLIC MENU SCREEN (QR Code) ====================
function PublicMenuScreen({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'food' | 'boisson'>('food');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [showAllergenFilter, setShowAllergenFilter] = useState(false);
  
  const primaryColor = restaurant?.primary_color || '#2c5f2d';
  const secondaryColor = restaurant?.secondary_color || '#f5f5dc';
  
  const allergensList = ['gluten', 'crustaces', 'oeufs', 'poisson', 'arachides', 'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques'];
  
  useEffect(() => {
    loadMenuData();
  }, [restaurantId, activeTab]);
  
  const loadMenuData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/menu-restaurant/public/${restaurantId}?menu_type=${activeTab}`);
      if (!response.ok) throw new Error('Erreur chargement');
      const data = await response.json();
      setRestaurant(data.restaurant);
      setSections(data.sections || []);
      setItems(data.items || []);
    } catch (error) {
      console.error('Erreur chargement menu:', error);
    }
    setIsLoading(false);
  };
  
  // Filtrer les items par recherche et allergènes
  const filteredItems = items.filter(item => {
    // Filtre recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const nameMatch = item.name?.toLowerCase().includes(query);
      const descMatch = item.descriptions?.some((d: string) => d.toLowerCase().includes(query));
      if (!nameMatch && !descMatch) return false;
    }
    // Filtre allergènes (exclure si l'item contient l'allergène)
    if (selectedAllergens.length > 0) {
      const itemAllergens = item.allergens || [];
      const hasExcludedAllergen = selectedAllergens.some(a => itemAllergens.includes(a));
      if (hasExcludedAllergen) return false;
    }
    return true;
  });
  
  // Grouper les items par section
  const getItemsForSection = (sectionId: string) => {
    return filteredItems.filter(item => item.section_id === sectionId);
  };
  
  // Formater le prix avec formats
  const formatPrice = (item: any) => {
    if (item.formats && item.formats.length > 0) {
      if (item.formats.length === 1) {
        return `${(item.formats[0].selling_price || item.formats[0].price || 0).toFixed(2)}€`;
      }
      const prices = item.formats.map((f: any) => f.selling_price || f.price || 0);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return `${minPrice.toFixed(2)}€ - ${maxPrice.toFixed(2)}€`;
    }
    return item.price ? `${item.price.toFixed(2)}€` : '';
  };
  
  if (isLoading && !restaurant) {
    return (
      <SafeAreaWrapper backgroundColor={primaryColor} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={secondaryColor} />
        <Text style={{ color: secondaryColor, marginTop: 16 }}>Chargement du menu...</Text>
      </SafeAreaWrapper>
    );
  }
  
  return (
    <SafeAreaWrapper backgroundColor={primaryColor} style={{ flex: 1 }}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={{ padding: 16, alignItems: 'center' }}>
        {restaurant?.logo_base64 && (
          <Image source={{ uri: `data:image/png;base64,${restaurant.logo_base64}` }} style={{ width: 70, height: 70, marginBottom: 8 }} resizeMode="contain" />
        )}
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: secondaryColor }}>{restaurant?.name || 'Menu'}</Text>
      </View>
      
      {/* Tabs Food / Boisson */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 }}>
        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 12, 
            alignItems: 'center',
            backgroundColor: activeTab === 'food' ? secondaryColor : 'transparent',
            borderRadius: 8,
            marginRight: 8
          }}
          onPress={() => setActiveTab('food')}
          data-testid="tab-food"
        >
          <WebIcon name="restaurant" size={24} color={activeTab === 'food' ? primaryColor : secondaryColor} />
          <Text style={{ color: activeTab === 'food' ? primaryColor : secondaryColor, fontWeight: '600', marginTop: 4 }}>Carte Food</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ 
            flex: 1, 
            paddingVertical: 12, 
            alignItems: 'center',
            backgroundColor: activeTab === 'boisson' ? secondaryColor : 'transparent',
            borderRadius: 8
          }}
          onPress={() => setActiveTab('boisson')}
          data-testid="tab-boisson"
        >
          <WebIcon name="wine" size={24} color={activeTab === 'boisson' ? primaryColor : secondaryColor} />
          <Text style={{ color: activeTab === 'boisson' ? primaryColor : secondaryColor, fontWeight: '600', marginTop: 4 }}>Carte Boisson</Text>
        </TouchableOpacity>
      </View>
      
      {/* Search Bar + Allergen Filter */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: secondaryColor, borderRadius: 8, paddingHorizontal: 12 }}>
            <WebIcon name="search" size={20} color="#666" />
            <TextInput 
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: '#333' }}
              placeholder="Rechercher un plat..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              data-testid="search-input"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <WebIcon name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity 
            style={{ 
              marginLeft: 8, 
              padding: 10, 
              backgroundColor: selectedAllergens.length > 0 ? '#f44336' : secondaryColor, 
              borderRadius: 8 
            }}
            onPress={() => setShowAllergenFilter(!showAllergenFilter)}
            data-testid="allergen-filter-btn"
          >
            <WebIcon name="filter" size={24} color={selectedAllergens.length > 0 ? '#fff' : primaryColor} />
          </TouchableOpacity>
        </View>
        
        {/* Allergen Filter Panel */}
        {showAllergenFilter && (
          <View style={{ backgroundColor: secondaryColor, borderRadius: 8, padding: 12, marginTop: 8 }}>
            <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Exclure les allergènes :</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {allergensList.map(allergen => (
                <TouchableOpacity 
                  key={allergen}
                  style={{ 
                    paddingHorizontal: 12, 
                    paddingVertical: 6, 
                    backgroundColor: selectedAllergens.includes(allergen) ? '#f44336' : '#eee',
                    borderRadius: 16
                  }}
                  onPress={() => {
                    if (selectedAllergens.includes(allergen)) {
                      setSelectedAllergens(selectedAllergens.filter(a => a !== allergen));
                    } else {
                      setSelectedAllergens([...selectedAllergens, allergen]);
                    }
                  }}
                >
                  <Text style={{ fontSize: 12, color: selectedAllergens.includes(allergen) ? '#fff' : '#333' }}>
                    {allergen.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedAllergens.length > 0 && (
              <TouchableOpacity 
                style={{ marginTop: 8, alignItems: 'center' }}
                onPress={() => setSelectedAllergens([])}
              >
                <Text style={{ color: '#f44336', fontSize: 12 }}>Réinitialiser les filtres</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      
      {/* Menu Content */}
      <ScrollView style={{ flex: 1, backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <View style={{ padding: 16 }}>
          {isLoading ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : sections.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <WebIcon name="restaurant-outline" size={48} color="#ccc" />
              <Text style={{ color: '#666', marginTop: 8 }}>Aucun plat disponible</Text>
            </View>
          ) : (
            sections.map((section: any) => {
              const sectionItems = getItemsForSection(section.section_id);
              if (sectionItems.length === 0 && searchQuery) return null; // Hide empty sections when searching
              
              return (
                <View key={section.section_id} style={{ marginBottom: 24 }} data-testid={`section-${section.section_id}`}>
                  {/* Section Header */}
                  <View style={{ borderBottomWidth: 2, borderBottomColor: primaryColor, paddingBottom: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: primaryColor }}>{section.name}</Text>
                    {section.description && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{section.description}</Text>}
                  </View>
                  
                  {/* Items */}
                  {sectionItems.length === 0 ? (
                    <Text style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', padding: 16 }}>Aucun résultat</Text>
                  ) : (
                    sectionItems.map((item: any) => (
                      <View key={item.item_id} style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: 16 }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }}>{item.name}</Text>
                            {item.descriptions?.map((desc: string, i: number) => (
                              <Text key={i} style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{desc}</Text>
                            ))}
                            {/* Formats/Tailles */}
                            {item.formats && item.formats.length > 1 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                {item.formats.map((format: any, i: number) => (
                                  <View key={i} style={{ backgroundColor: `${primaryColor}15`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 12, color: primaryColor }}>
                                      {format.name}: {(format.selling_price || format.price || 0).toFixed(2)}€
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                            {/* Allergènes */}
                            {item.allergens && item.allergens.length > 0 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                {item.allergens.map((allergen: string, i: number) => (
                                  <View key={i} style={{ backgroundColor: '#ffebee', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 10, color: '#c62828' }}>{allergen.replace(/_/g, ' ')}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                            {/* Options payantes */}
                            {item.options && item.options.length > 0 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                {item.options.map((opt: any, i: number) => (
                                  <View key={i} style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                                    <Text style={{ fontSize: 11, color: '#2e7d32' }}>
                                      +{opt.price?.toFixed(2)}€ {opt.name}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor }}>{formatPrice(item)}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })
          )}
          
          {/* Footer */}
          <View style={{ alignItems: 'center', padding: 24, marginBottom: 32 }}>
            <Text style={{ fontSize: 12, color: '#999' }}>Menu propulsé par NeoChef</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaWrapper>
  );
}

// ==================== FICHE TECHNIQUE SCREEN ====================
function FicheTechniqueScreen({ sections, products, primaryColor, secondaryColor, apiRequest, loadSections, loadProducts, sessionToken, setCurrentScreen, isManager = true, userFicheTechniqueAccess = 'both', userFichePermissions = {} }: any) {
  const [currentView, setCurrentView] = useState<'main' | 'sections' | 'products' | 'productDetail' | 'export' | 'preparations' | 'marginAnalysis' | 'archived'>('main');
  const [selectedCategory, setSelectedCategory] = useState<'bar' | 'cuisine' | null>(null);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Permission helpers - pour afficher les boutons selon les permissions
  const canExportPdfExcel = isManager || userFichePermissions?.export_pdf_excel === true;
  const canAnalyzeMargins = isManager || userFichePermissions?.analyse_marges === true;
  const canAddSection = isManager || userFichePermissions?.section?.ajouter === true;
  const canEditSection = isManager || userFichePermissions?.section?.modifier === true;
  const canDeleteSection = isManager || userFichePermissions?.section?.supprimer === true;
  const canAddProduct = isManager || userFichePermissions?.produits?.ajouter === true;
  const canEditProduct = isManager || userFichePermissions?.produits?.modifier === true;
  const canDeleteProduct = isManager || userFichePermissions?.produits?.supprimer === true;
  const canAddPhoto = isManager || userFichePermissions?.photo?.ajouter === true;
  const canDeletePhoto = isManager || userFichePermissions?.photo?.supprimer === true;
  
  // État pour ouvrir le modal après changement de vue
  const [pendingOpenAddProduct, setPendingOpenAddProduct] = useState(false);
  
  // Modal states
  const [showAddSection, setShowAddSection] = useState(false);
  const [showEditSection, setShowEditSection] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showEditProduct, setShowEditProduct] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddPreparationIngredient, setShowAddPreparationIngredient] = useState(false);
  
  // Effect pour ouvrir le modal après changement de vue vers 'products'
  useEffect(() => {
    if (pendingOpenAddProduct && currentView === 'products') {
      setShowAddProduct(true);
      setPendingOpenAddProduct(false);
    }
  }, [currentView, pendingOpenAddProduct]);
  
  // Form states pour Section
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSectionName, setEditingSectionName] = useState('');
  const [newSectionIsPreparations, setNewSectionIsPreparations] = useState(false);
  
  // Form states pour Product (standard + preparation)
  const [newProductName, setNewProductName] = useState('');
  const [newProductMultiplier, setNewProductMultiplier] = useState('');
  const [newProductIngredients, setNewProductIngredients] = useState<any[]>([]);
  const [newProductType, setNewProductType] = useState<'standard' | 'preparation' | 'boisson_multi'>('standard');
  const [newProductSellingPrice, setNewProductSellingPrice] = useState('');
  const [newProductPhoto, setNewProductPhoto] = useState<string | null>(null);
  const [newProductNotes, setNewProductNotes] = useState('');  // Notes de préparation
  
  // Form states pour Preparation
  const [newYieldQuantity, setNewYieldQuantity] = useState('');
  const [newYieldUnit, setNewYieldUnit] = useState('portion');
  
  // Form states pour Boisson Multi
  const [newPurchaseQuantity, setNewPurchaseQuantity] = useState('');
  const [newPurchaseUnit, setNewPurchaseUnit] = useState('cl');
  const [newPurchasePrice, setNewPurchasePrice] = useState('');
  const [newSellingFormats, setNewSellingFormats] = useState<any[]>([]);
  
  // Préparations disponibles
  const [availablePreparations, setAvailablePreparations] = useState<any[]>([]);
  
  // Photo display states
  const [showPhotos, setShowPhotos] = useState(true);
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);
  
  // Export selection
  const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
  const [exportWithPrices, setExportWithPrices] = useState(true);
  const [exportCategoryFilter, setExportCategoryFilter] = useState<'all' | 'bar' | 'cuisine'>('all');
  
  // Archivage state
  const [archivedProducts, setArchivedProducts] = useState<any[]>([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  
  // Menu Restaurant export state
  const [showSendToMenuModal, setShowSendToMenuModal] = useState(false);
  const [productForMenu, setProductForMenu] = useState<any>(null);
  const [menuRestaurantSections, setMenuRestaurantSections] = useState<any[]>([]);
  const [selectedMenuSection, setSelectedMenuSection] = useState<string | null>(null);
  const [menuTargetType, setMenuTargetType] = useState<'food' | 'boisson'>('food');
  
  // Margin Analysis state
  const [marginAnalysisData, setMarginAnalysisData] = useState<any>(null);
  const [marginSortBy, setMarginSortBy] = useState<'name' | 'margin' | 'category'>('margin');
  const [marginFilterCategory, setMarginFilterCategory] = useState<'all' | 'faible' | 'moyen' | 'bon' | 'undefined'>('all');
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [editingThresholdSection, setEditingThresholdSection] = useState<any>(null);
  const [thresholdLow, setThresholdLow] = useState('');
  const [thresholdHigh, setThresholdHigh] = useState('');
  
  // Import PDF state
  const [showImportPdfModal, setShowImportPdfModal] = useState(false);
  const [pdfExtractedProducts, setPdfExtractedProducts] = useState<any[]>([]);
  const [selectedImportProducts, setSelectedImportProducts] = useState<string[]>([]);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [importCategoryFilter, setImportCategoryFilter] = useState<'all' | 'bar' | 'cuisine'>('all');
  const [importSectionFilter, setImportSectionFilter] = useState<string>('all');
  
  // Sélecteur Carte Food/Boisson state
  const [showMenuSelector, setShowMenuSelector] = useState(false);
  const [menuSelectorSections, setMenuSelectorSections] = useState<any[]>([]);
  const [menuSelectorItems, setMenuSelectorItems] = useState<any[]>([]);
  const [menuSelectorSearchQuery, setMenuSelectorSearchQuery] = useState('');
  const [isLoadingMenuSelector, setIsLoadingMenuSelector] = useState(false);
  
  // Charger les données du Menu Restaurant pour le sélecteur
  const loadMenuSelectorData = async () => {
    setIsLoadingMenuSelector(true);
    try {
      // Charger Food ou Boisson selon la catégorie actuelle
      const menuType = selectedCategory === 'bar' ? 'boisson' : 'food';
      const sectionsData = await apiRequest(`/menu-restaurant/sections/list?menu_type=${menuType}`);
      const itemsData = await apiRequest(`/menu-restaurant/items/list?menu_type=${menuType}`);
      setMenuSelectorSections(sectionsData);
      setMenuSelectorItems(itemsData);
    } catch (error: any) {
      console.error('Erreur chargement Menu Restaurant:', error);
    }
    setIsLoadingMenuSelector(false);
  };
  
  // Sélectionner un produit depuis le Menu Restaurant
  const selectFromMenuRestaurant = (item: any) => {
    console.log('[selectFromMenuRestaurant] Called with:', item.name);
    console.log('[selectFromMenuRestaurant] currentView:', currentView);
    console.log('[selectFromMenuRestaurant] selectedSection:', selectedSection?.name);
    
    // Pré-remplir le formulaire avec les données du produit sélectionné
    setNewProductName(item.name);
    
    // Parser la description pour créer des ingrédients (séparés par virgules)
    const description = item.descriptions?.join(', ') || item.description || '';
    console.log('[selectFromMenuRestaurant] Description to parse:', description);
    
    if (description.trim()) {
      // Séparer par virgules et créer des ingrédients
      const ingredientNames = description.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      console.log('[selectFromMenuRestaurant] Parsed ingredients:', ingredientNames);
      
      const ingredients = ingredientNames.map((name: string) => ({
        ingredient_type: 'standard',
        name: name,
        quantity_used: '',
        unit_used: 'g',
        quantity_purchased: '',
        unit_purchased: 'kg',
        purchase_price: ''
      }));
      
      setNewProductIngredients(ingredients);
    } else {
      setNewProductIngredients([]);
    }
    
    // Laisser le champ Notes vide
    setNewProductNotes('');
    
    setShowMenuSelector(false);
    setMenuSelectorSearchQuery('');
    loadPreparations();
    
    // Ouvrir directement le modal d'ajout de produit (sans changer de vue)
    console.log('[selectFromMenuRestaurant] Opening add product modal directly');
    setShowAddProduct(true);
  };
  
  // Units disponibles
  const units = ['g', 'kg', 'ml', 'cl', 'l'];
  const yieldUnits = ['portion', 'unité', 'pièce', 'g', 'kg', 'ml', 'cl', 'l'];
  
  // Charger les produits archivés
  const loadArchivedProducts = async () => {
    setIsLoadingArchived(true);
    try {
      const data = await apiRequest('/fiche-products/archived');
      setArchivedProducts(data);
    } catch (error) {
      console.error('Error loading archived products:', error);
    }
    setIsLoadingArchived(false);
  };
  
  // Archiver un produit
  const handleArchiveProduct = async (productId: string) => {
    if (!confirm('Archiver ce produit ? Il sera déplacé dans l\'onglet Archivage.')) return;
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-products/${productId}/archive`, { method: 'PUT' });
      await loadProducts();
      alert('Produit archivé avec succès');
    } catch (error: any) {
      console.error('Error archiving product:', error);
      alert(error.message || 'Erreur lors de l\'archivage');
    }
    setIsLoading(false);
  };
  
  // Restaurer un produit archivé
  const handleRestoreProduct = async (productId: string) => {
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-products/${productId}/restore`, { method: 'PUT' });
      await loadArchivedProducts();
      await loadProducts();
      alert('Produit restauré avec succès');
    } catch (error: any) {
      console.error('Error restoring product:', error);
      alert(error.message || 'Erreur lors de la restauration');
    }
    setIsLoading(false);
  };
  
  // Menu Restaurant: charger les sections
  const loadMenuRestaurantSections = async (menuType: 'food' | 'boisson') => {
    try {
      const data = await apiRequest(`/menu-restaurant/sections/list?menu_type=${menuType}`);
      setMenuRestaurantSections(data);
    } catch (error) {
      console.error('Error loading menu sections:', error);
    }
  };
  
  // Menu Restaurant: ouvrir le modal pour envoyer un produit
  const openSendToMenuModal = (product: any, targetType: 'food' | 'boisson') => {
    setProductForMenu(product);
    setMenuTargetType(targetType);
    setSelectedMenuSection(null);
    loadMenuRestaurantSections(targetType);
    setShowSendToMenuModal(true);
  };
  
  // Menu Restaurant: envoyer le produit vers le menu
  const handleSendToMenu = async () => {
    if (!productForMenu || !selectedMenuSection) {
      alert('Veuillez sélectionner une section');
      return;
    }
    setIsLoading(true);
    try {
      // Préparer les descriptions à partir des ingrédients
      const descriptions: string[] = [];
      if (productForMenu.ingredients && productForMenu.ingredients.length > 0) {
        const ingredientsList = productForMenu.ingredients.map((ing: any) => ing.name).join(', ');
        descriptions.push(ingredientsList);
      }
      
      // Préparer les formats pour boisson_multi
      let formats: any[] = [];
      let price = productForMenu.selling_price || null;
      
      if (productForMenu.product_type === 'boisson_multi' && productForMenu.selling_formats) {
        formats = productForMenu.selling_formats.map((f: any) => ({
          name: `${f.quantity}${f.unit}`,
          price: f.price,
          happy_hour_price: null
        }));
        price = null; // Multi-formats, pas de prix simple
      }
      
      await apiRequest(`${apiPrefix}/items/create`, {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedMenuSection,
          fiche_technique_product_id: productForMenu.product_id,
          name: productForMenu.name,
          descriptions: descriptions,
          price: price,
          formats: formats,
          suggestions: [],
          supplements: []
        })
      });
      
      setShowSendToMenuModal(false);
      alert(`Produit ajouté à la ${menuTargetType === 'food' ? 'Carte Food' : 'Carte Boisson'} !`);
    } catch (error: any) {
      console.error('Error sending to menu:', error);
      alert(error.message || 'Erreur lors de l\'ajout au menu');
    }
    setIsLoading(false);
  };
  
  // Supprimer définitivement un produit archivé
  const handlePermanentDelete = async (productId: string) => {
    if (!confirm('ATTENTION: Cette action est irréversible. Supprimer définitivement ce produit ?')) return;
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-products/${productId}/permanent`, { method: 'DELETE' });
      await loadArchivedProducts();
      alert('Produit supprimé définitivement');
    } catch (error: any) {
      console.error('Error deleting product:', error);
      alert(error.message || 'Erreur lors de la suppression');
    }
    setIsLoading(false);
  };
  
  // Charger les préparations disponibles
  const loadPreparations = async () => {
    try {
      const data = await apiRequest('/fiche-products/preparations/list');
      setAvailablePreparations(data);
    } catch (error) {
      console.error('Error loading preparations:', error);
    }
  };
  
  // Charger l'analyse des marges
  const loadMarginAnalysis = async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest('/fiche-products/margin-analysis');
      setMarginAnalysisData(data);
    } catch (error) {
      console.error('Error loading margin analysis:', error);
      alert('Erreur lors du chargement de l\'analyse des marges');
    }
    setIsLoading(false);
  };
  
  // Mettre à jour les seuils de marge d'une section
  const handleUpdateThresholds = async () => {
    if (!editingThresholdSection) return;
    const lowVal = parseFloat(thresholdLow);
    const highVal = parseFloat(thresholdHigh);
    
    if (isNaN(lowVal) || isNaN(highVal)) {
      alert('Veuillez entrer des valeurs numériques valides');
      return;
    }
    if (lowVal < 0 || highVal < 0) {
      alert('Les seuils doivent être positifs');
      return;
    }
    if (lowVal >= highVal) {
      alert('Le seuil "faible" doit être inférieur au seuil "bon"');
      return;
    }
    
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-sections/${editingThresholdSection.section_id}/margin-thresholds`, {
        method: 'PUT',
        body: JSON.stringify({ low: lowVal, high: highVal })
      });
      setShowThresholdModal(false);
      setEditingThresholdSection(null);
      // Recharger les données
      await loadMarginAnalysis();
      await loadSections();
    } catch (error: any) {
      console.error('Error updating thresholds:', error);
      alert(error.message || 'Erreur lors de la mise à jour des seuils');
    }
    setIsLoading(false);
  };
  
  // Ouvrir le modal de configuration des seuils
  const openThresholdModal = (section: any) => {
    setEditingThresholdSection(section);
    setThresholdLow(section.thresholds?.low?.toString() || '20');
    setThresholdHigh(section.thresholds?.high?.toString() || '50');
    setShowThresholdModal(true);
  };
  
  // Couleur selon la catégorie de marge
  const getMarginColor = (category: string): string => {
    switch (category) {
      case 'faible': return '#e74c3c';  // Rouge
      case 'moyen': return '#f39c12';   // Jaune/Orange
      case 'bon': return '#27ae60';     // Vert
      default: return '#95a5a6';        // Gris
    }
  };
  
  // Emoji selon la catégorie de marge
  const getMarginEmoji = (category: string): string => {
    switch (category) {
      case 'faible': return '🔴';
      case 'moyen': return '🟡';
      case 'bon': return '🟢';
      default: return '⚪';
    }
  };
  
  // Filtrer et trier les produits pour l'analyse
  const getFilteredAndSortedProducts = () => {
    if (!marginAnalysisData) return [];
    
    let filtered = marginAnalysisData.all_products;
    
    // Filtrer par catégorie de marge
    if (marginFilterCategory !== 'all') {
      filtered = filtered.filter((p: any) => p.margin_category === marginFilterCategory);
    }
    
    // Trier
    return filtered.sort((a: any, b: any) => {
      if (marginSortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (marginSortBy === 'margin') {
        const marginA = a.margin_percent ?? -999;
        const marginB = b.margin_percent ?? -999;
        return marginA - marginB;  // Du plus faible au plus fort
      } else {
        // Par catégorie : faible -> moyen -> bon -> undefined
        const order = { 'faible': 0, 'moyen': 1, 'bon': 2, 'undefined': 3 };
        return (order[a.margin_category as keyof typeof order] || 3) - (order[b.margin_category as keyof typeof order] || 3);
      }
    });
  };
  
  // Vérifier si l'utilisateur peut voir une catégorie
  const canViewCategory = (category: 'bar' | 'cuisine'): boolean => {
    // Normalize access values
    const normalizedAccess = userFicheTechniqueAccess === 'tous' || userFicheTechniqueAccess === 'all' ? 'both' : userFicheTechniqueAccess;
    if (normalizedAccess === 'both') return true;
    return normalizedAccess === category;
  };
  
  // Vérifier si l'utilisateur peut modifier la Fiche Technique
  const canEditFicheTechnique = (): boolean => {
    // Admin peut toujours modifier, staff selon ses permissions
    return isManager || canEditSection || canEditProduct || canAddSection || canAddProduct;
  };
  
  // Filtrer les sections par catégorie (en tenant compte des permissions)
  const barSections = canViewCategory('bar') ? sections.filter((s: any) => s.category === 'bar') : [];
  const cuisineSections = canViewCategory('cuisine') ? sections.filter((s: any) => s.category === 'cuisine') : [];
  
  // Produits de la section sélectionnée
  const sectionProducts = selectedSection ? products.filter((p: any) => p.section_id === selectedSection.section_id) : [];
  
  // --- CRUD Sections ---
  const handleCreateSection = async () => {
    if (!newSectionName.trim() || !selectedCategory) return;
    setIsLoading(true);
    try {
      await apiRequest('/fiche-sections/create', {
        method: 'POST',
        body: JSON.stringify({ category: selectedCategory, name: newSectionName.trim() })
      });
      setNewSectionName('');
      setShowAddSection(false);
      await loadSections();
    } catch (error) {
      console.error('Error creating section:', error);
      alert('Erreur lors de la création de la section');
    }
    setIsLoading(false);
  };
  
  const handleUpdateSection = async () => {
    if (!editingSectionName.trim() || !selectedSection) return;
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-sections/${selectedSection.section_id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editingSectionName.trim() })
      });
      setShowEditSection(false);
      setEditingSectionName('');
      await loadSections();
    } catch (error) {
      console.error('Error updating section:', error);
      alert('Erreur lors de la modification de la section');
    }
    setIsLoading(false);
  };
  
  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm('Supprimer cette section et tous ses produits ?')) return;
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-sections/${sectionId}`, { method: 'DELETE' });
      await loadSections();
      await loadProducts();
    } catch (error) {
      console.error('Error deleting section:', error);
      alert('Erreur lors de la suppression de la section');
    }
    setIsLoading(false);
  };
  
  // --- CRUD Products ---
  const resetProductForm = () => {
    setNewProductName('');
    setNewProductMultiplier('');
    setNewProductIngredients([]);
    setNewProductType('standard');
    setNewProductSellingPrice('');
    setNewProductPhoto(null);
    setNewProductNotes('');  // Reset notes
    setNewYieldQuantity('');
    setNewYieldUnit('portion');
    setNewPurchaseQuantity('');
    setNewPurchaseUnit('cl');
    setNewPurchasePrice('');
    setNewSellingFormats([]);
  };
  
  // Gestion de l'upload de photo
  const handlePhotoUpload = (event: any) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB max
        alert('La photo ne doit pas dépasser 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProductPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim() || !selectedSection) return;
    setIsLoading(true);
    try {
      let body: any = {
        section_id: selectedSection.section_id,
        name: newProductName.trim(),
        product_type: newProductType,
        photo_base64: newProductPhoto,
        notes: newProductNotes.trim() || null  // Ajout des notes
      };

      if (newProductType === 'standard' || newProductType === 'preparation') {
        body.multiplier = newProductMultiplier ? parseFloat(newProductMultiplier) : null;
        body.selling_price_override = newProductSellingPrice ? parseFloat(newProductSellingPrice) : null;
        body.ingredients = newProductIngredients;
        
        if (newProductType === 'preparation') {
          body.yield_quantity = newYieldQuantity ? parseFloat(newYieldQuantity) : 1;
          body.yield_unit = newYieldUnit;
        }
      } else if (newProductType === 'boisson_multi') {
        body.purchase_info = {
          quantity: parseFloat(newPurchaseQuantity) || 0,
          unit: newPurchaseUnit,
          price: parseFloat(newPurchasePrice) || 0
        };
        body.selling_formats = newSellingFormats;
      }

      await apiRequest('/fiche-products/create', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      resetProductForm();
      setShowAddProduct(false);
      await loadProducts();
      await loadPreparations();
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Erreur lors de la création du produit');
    }
    setIsLoading(false);
  };
  
  const handleUpdateProduct = async () => {
    if (!newProductName.trim() || !selectedProduct) return;
    setIsLoading(true);
    try {
      let body: any = {
        name: newProductName.trim(),
        product_type: newProductType,
        photo_base64: newProductPhoto,
        notes: newProductNotes.trim() || null  // Ajout des notes
      };

      if (newProductType === 'standard' || newProductType === 'preparation') {
        body.multiplier = newProductMultiplier ? parseFloat(newProductMultiplier) : null;
        body.selling_price_override = newProductSellingPrice ? parseFloat(newProductSellingPrice) : null;
        body.ingredients = newProductIngredients;
        
        if (newProductType === 'preparation') {
          body.yield_quantity = newYieldQuantity ? parseFloat(newYieldQuantity) : 1;
          body.yield_unit = newYieldUnit;
        }
      } else if (newProductType === 'boisson_multi') {
        body.purchase_info = {
          quantity: parseFloat(newPurchaseQuantity) || 0,
          unit: newPurchaseUnit,
          price: parseFloat(newPurchasePrice) || 0
        };
        body.selling_formats = newSellingFormats;
      }

      await apiRequest(`/fiche-products/${selectedProduct.product_id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      setShowEditProduct(false);
      await loadProducts();
      await loadPreparations();
      // Mettre à jour le produit sélectionné
      const updatedProduct = await apiRequest(`/fiche-products/${selectedProduct.product_id}`);
      setSelectedProduct(updatedProduct);
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Erreur lors de la modification du produit');
    }
    setIsLoading(false);
  };
  
  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Supprimer ce produit ?')) return;
    setIsLoading(true);
    try {
      await apiRequest(`/fiche-products/${productId}`, { method: 'DELETE' });
      await loadProducts();
      await loadPreparations();
      if (currentView === 'productDetail') {
        setCurrentView('products');
        setSelectedProduct(null);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Erreur lors de la suppression du produit');
    }
    setIsLoading(false);
  };
  
  // --- Ingrédients ---
  const addIngredient = () => {
    setNewProductIngredients([...newProductIngredients, {
      ingredient_type: 'standard',
      name: '',
      quantity_used: '',
      unit_used: 'g',
      quantity_purchased: '',
      unit_purchased: 'kg',
      purchase_price: ''
    }]);
  };
  
  const addPreparationAsIngredient = (prep: any) => {
    setNewProductIngredients([...newProductIngredients, {
      ingredient_type: 'preparation',
      preparation_id: prep.product_id,
      preparation_name: prep.name,
      name: prep.name,
      quantity_used: 1,
      unit_used: prep.yield_unit || 'portion',
      quantity_purchased: 0,
      unit_purchased: '',
      purchase_price: 0,
      cost: prep.cost_per_unit
    }]);
    setShowAddPreparationIngredient(false);
  };
  
  const updateIngredient = (index: number, field: string, value: string | number) => {
    const updated = [...newProductIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setNewProductIngredients(updated);
  };
  
  const removeIngredient = (index: number) => {
    setNewProductIngredients(newProductIngredients.filter((_, i) => i !== index));
  };
  
  // --- Formats de vente (Boisson Multi) ---
  const addSellingFormat = () => {
    setNewSellingFormats([...newSellingFormats, {
      name: '',
      size: '',
      unit: 'cl',
      selling_price: ''
    }]);
  };
  
  const updateSellingFormat = (index: number, field: string, value: string | number) => {
    const updated = [...newSellingFormats];
    updated[index] = { ...updated[index], [field]: value };
    setNewSellingFormats(updated);
  };
  
  const removeSellingFormat = (index: number) => {
    setNewSellingFormats(newSellingFormats.filter((_, i) => i !== index));
  };
  
  // --- Export ---
  const toggleExportSelection = (productId: string) => {
    if (selectedForExport.includes(productId)) {
      setSelectedForExport(selectedForExport.filter(id => id !== productId));
    } else {
      setSelectedForExport([...selectedForExport, productId]);
    }
  };
  
  const handleExportPDF = async () => {
    if (selectedForExport.length === 0) {
      alert('Sélectionnez au moins un produit à exporter');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/fiche-products/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          product_ids: selectedForExport,
          include_prices: exportWithPrices
        })
      });
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'fiches_techniques.pdf', { type: 'application/pdf' });
        
        // iOS PWA: Utiliser navigator.share()
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
          try {
            const shareData = { files: [file], title: 'fiches_techniques.pdf' };
            if (navigator.canShare(shareData)) {
              await navigator.share(shareData);
              alert('PDF exporté avec succès !');
              setIsLoading(false);
              return;
            }
          } catch (shareError: any) {
            if (shareError.name === 'AbortError') {
              setIsLoading(false);
              return;
            }
          }
        }
        
        // Fallback desktop
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fiches_techniques.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
        alert('PDF exporté avec succès !');
      } else {
        alert('Erreur lors de l\'export PDF');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Erreur lors de l\'export PDF');
    }
    setIsLoading(false);
  };
  
  const handleExportExcel = async () => {
    if (selectedForExport.length === 0) {
      alert('Sélectionnez au moins un produit à exporter');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/fiche-products/export-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          product_ids: selectedForExport,
          include_prices: exportWithPrices
        })
      });
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'fiches_techniques.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // iOS PWA: Utiliser navigator.share()
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
          try {
            const shareData = { files: [file], title: 'fiches_techniques.xlsx' };
            if (navigator.canShare(shareData)) {
              await navigator.share(shareData);
              alert('Excel exporté avec succès !');
              setIsLoading(false);
              return;
            }
          } catch (shareError: any) {
            if (shareError.name === 'AbortError') {
              setIsLoading(false);
              return;
            }
          }
        }
        
        // Fallback desktop
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fiches_techniques.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        alert('Excel exporté avec succès !');
      } else {
        alert('Erreur lors de l\'export Excel');
      }
    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert('Erreur lors de l\'export Excel');
    }
    setIsLoading(false);
  };
  
  // Reset et open edit modal
  const openEditProduct = (product: any) => {
    setSelectedProduct(product);
    setNewProductName(product.name);
    setNewProductType(product.product_type || 'standard');
    setNewProductMultiplier(product.multiplier?.toString() || '');
    setNewProductSellingPrice(product.selling_price_override?.toString() || '');
    setNewProductIngredients(product.ingredients || []);
    setNewProductPhoto(product.photo_base64 || null);
    setNewProductNotes(product.notes || '');  // Charger les notes
    
    // Pour les préparations
    setNewYieldQuantity(product.yield_quantity?.toString() || '');
    setNewYieldUnit(product.yield_unit || 'portion');
    
    // Pour les boissons multi
    if (product.purchase_info) {
      setNewPurchaseQuantity(product.purchase_info.quantity?.toString() || '');
      setNewPurchaseUnit(product.purchase_info.unit || 'cl');
      setNewPurchasePrice(product.purchase_info.price?.toString() || '');
    }
    setNewSellingFormats(product.selling_formats || []);
    
    loadPreparations();
    setShowEditProduct(true);
  };
  
  // --- MODALS PARTAGÉS ---
  
  // Modal Ajouter/Modifier Produit - partagé entre toutes les vues
  const renderAddProductModal = () => {
    if (!showAddProduct && !showEditProduct) return null;
    
    return (
      <>
        <Modal visible={true} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
            <ScrollView style={{ maxHeight: '90%' }}>
              <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>
                  {showEditProduct ? 'Modifier le produit' : 'Nouveau produit'}
                </Text>
                
                {/* Upload Photo (optionnel) */}
                <Text style={{ color: primaryColor, marginBottom: 8, fontWeight: 'bold' }}>Photo (optionnel)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  {newProductPhoto ? (
                    <TouchableOpacity onPress={() => setFullScreenPhoto(newProductPhoto)}>
                      <img 
                        src={newProductPhoto} 
                        alt="Photo produit"
                        style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ 
                      width: 80, 
                      height: 80, 
                      borderRadius: 8, 
                      backgroundColor: '#e0e0e0',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}>
                      <Text style={{ color: '#999', fontSize: 24 }}>📷</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 8 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                      id="photo-upload-input-shared"
                    />
                    <TouchableOpacity
                      style={{ backgroundColor: primaryColor, padding: 10, borderRadius: 6, alignItems: 'center' }}
                      onPress={() => document.getElementById('photo-upload-input-shared')?.click()}
                    >
                      <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 13 }}>
                        {newProductPhoto ? 'Changer la photo' : 'Ajouter une photo'}
                      </Text>
                    </TouchableOpacity>
                    {newProductPhoto && (
                      <TouchableOpacity
                        style={{ backgroundColor: '#e74c3c', padding: 8, borderRadius: 6, alignItems: 'center' }}
                        onPress={() => setNewProductPhoto(null)}
                      >
                        <Text style={{ color: '#fff', fontSize: 12 }}>Supprimer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                
                {/* Type de produit */}
                {!showEditProduct && (
                  <>
                    <Text style={{ color: primaryColor, marginBottom: 8, fontWeight: 'bold' }}>Type de produit</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor: newProductType === 'standard' ? primaryColor : '#e0e0e0',
                          alignItems: 'center'
                        }}
                        onPress={() => setNewProductType('standard')}
                      >
                        <Text style={{ color: newProductType === 'standard' ? secondaryColor : '#333', fontWeight: 'bold' }}>Standard</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor: newProductType === 'preparation' ? '#FF9800' : '#e0e0e0',
                          alignItems: 'center'
                        }}
                        onPress={() => setNewProductType('preparation')}
                      >
                        <Text style={{ color: newProductType === 'preparation' ? '#fff' : '#333', fontWeight: 'bold' }}>Préparation</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor: newProductType === 'boisson_multi' ? '#9C27B0' : '#e0e0e0',
                          alignItems: 'center'
                        }}
                        onPress={() => setNewProductType('boisson_multi')}
                      >
                        <Text style={{ color: newProductType === 'boisson_multi' ? '#fff' : '#333', fontWeight: 'bold' }}>Boisson Multi</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
                
                {/* Nom du produit */}
                <Text style={{ color: primaryColor, marginBottom: 4 }}>Nom du produit</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: primaryColor,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    color: primaryColor
                  }}
                  placeholder={newProductType === 'boisson_multi' ? "Ex: Château Margaux 2020" : "Ex: Mojito, Salade César"}
                  placeholderTextColor="#999"
                  value={newProductName}
                  onChangeText={setNewProductName}
                  data-testid="new-product-name-input"
                />
                
                {/* === FORMULAIRE BOISSON MULTI === */}
                {newProductType === 'boisson_multi' && (
                  <>
                    <Text style={{ color: primaryColor, marginBottom: 8, fontWeight: 'bold', marginTop: 8 }}>Information d'achat</Text>
                    <View style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <View style={{ flex: 2 }}>
                          <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Quantité</Text>
                          <TextInput
                            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, backgroundColor: '#fff' }}
                            placeholder="Ex: 75"
                            keyboardType="decimal-pad"
                            value={newPurchaseQuantity}
                            onChangeText={setNewPurchaseQuantity}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Unité</Text>
                          <View style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#fff' }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              {['ml', 'cl', 'l'].map(u => (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => setNewPurchaseUnit(u)}
                                  style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 10,
                                    backgroundColor: newPurchaseUnit === u ? primaryColor : 'transparent',
                                    borderRadius: 4
                                  }}
                                >
                                  <Text style={{ color: newPurchaseUnit === u ? secondaryColor : '#333' }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                      </View>
                      <View>
                        <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Prix d'achat (€)</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, backgroundColor: '#fff' }}
                          placeholder="Ex: 18.00"
                          keyboardType="decimal-pad"
                          value={newPurchasePrice}
                          onChangeText={setNewPurchasePrice}
                        />
                      </View>
                    </View>
                    
                    <Text style={{ color: primaryColor, marginBottom: 8, fontWeight: 'bold' }}>Formats de vente</Text>
                    {newSellingFormats.map((sf: any, index: number) => (
                      <View key={index} style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ fontWeight: 'bold', color: primaryColor }}>Format {index + 1}</Text>
                          <TouchableOpacity onPress={() => removeSellingFormat(index)}>
                            <Text style={{ color: '#ff4444' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 8, backgroundColor: '#fff' }}
                          placeholder="Nom (ex: Verre 14cl)"
                          value={sf.name}
                          onChangeText={(v) => updateSellingFormat(index, 'name', v)}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, backgroundColor: '#fff' }}
                            placeholder="Taille"
                            keyboardType="decimal-pad"
                            value={sf.size?.toString()}
                            onChangeText={(v) => {
                              const normalized = v.replace(',', '.');
                              updateSellingFormat(index, 'size', normalized);
                            }}
                          />
                          <View style={{ width: 80, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#fff' }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              {['ml', 'cl', 'l'].map(u => (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => updateSellingFormat(index, 'unit', u)}
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 10,
                                    backgroundColor: sf.unit === u ? primaryColor : 'transparent',
                                    borderRadius: 4
                                  }}
                                >
                                  <Text style={{ fontSize: 12, color: sf.unit === u ? secondaryColor : '#333' }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, backgroundColor: '#fff' }}
                          placeholder="Prix de vente (€)"
                          keyboardType="decimal-pad"
                          value={sf.selling_price?.toString()}
                          onChangeText={(v) => {
                            const normalized = v.replace(',', '.');
                            updateSellingFormat(index, 'selling_price', normalized);
                          }}
                        />
                      </View>
                    ))}
                    <TouchableOpacity
                      style={{ backgroundColor: '#9C27B0', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 }}
                      onPress={addSellingFormat}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>+ Ajouter un format de vente</Text>
                    </TouchableOpacity>
                  </>
                )}
                
                {/* === FORMULAIRE STANDARD / PREPARATION === */}
                {(newProductType === 'standard' || newProductType === 'preparation') && (
                  <>
                    {/* Rendement (uniquement pour préparation) */}
                    {newProductType === 'preparation' && (
                      <>
                        <Text style={{ color: '#FF9800', marginBottom: 8, fontWeight: 'bold' }}>Rendement de la préparation</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                          <TextInput
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#FF9800',
                              borderRadius: 8,
                              padding: 12,
                              color: primaryColor
                            }}
                            placeholder="Quantité (ex: 50)"
                            keyboardType="decimal-pad"
                            value={newYieldQuantity}
                            onChangeText={setNewYieldQuantity}
                          />
                          <View style={{ flex: 1, borderWidth: 1, borderColor: '#FF9800', borderRadius: 8 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: 4 }}>
                              {yieldUnits.map(u => (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => setNewYieldUnit(u)}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    backgroundColor: newYieldUnit === u ? '#FF9800' : 'transparent',
                                    borderRadius: 4,
                                    marginHorizontal: 2
                                  }}
                                >
                                  <Text style={{ fontSize: 12, color: newYieldUnit === u ? '#fff' : '#333' }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                      </>
                    )}
                    
                    {/* Multiplicateur (uniquement pour standard) */}
                    {newProductType === 'standard' && (
                      <>
                        <Text style={{ color: primaryColor, marginBottom: 4 }}>Multiplicateur (pour prix de vente)</Text>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: primaryColor,
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 4,
                            color: primaryColor
                          }}
                          placeholder="Ex: 2.5, 3, 4"
                          placeholderTextColor="#999"
                          value={newProductMultiplier}
                          onChangeText={setNewProductMultiplier}
                          keyboardType="decimal-pad"
                          data-testid="new-product-multiplier-input"
                        />
                        <Text style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                          Ou modifiez le prix de vente manuellement :
                        </Text>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: '#4CAF50',
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 12,
                            color: primaryColor
                          }}
                          placeholder="Prix de vente manuel (€)"
                          placeholderTextColor="#999"
                          value={newProductSellingPrice}
                          onChangeText={setNewProductSellingPrice}
                          keyboardType="decimal-pad"
                        />
                      </>
                    )}
                    
                    {/* Ingrédients */}
                    <Text style={{ color: primaryColor, marginBottom: 8, fontWeight: 'bold' }}>Ingrédients</Text>
                
                {newProductIngredients.map((ing: any, index: number) => (
                  <View key={index} style={{ 
                    backgroundColor: ing.ingredient_type === 'preparation' ? '#FFF3E0' : '#f5f5f5', 
                    padding: 12, 
                    borderRadius: 8, 
                    marginBottom: 8,
                    borderLeftWidth: ing.ingredient_type === 'preparation' ? 4 : 0,
                    borderLeftColor: '#FF9800'
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontWeight: 'bold', color: primaryColor }}>
                        {ing.ingredient_type === 'preparation' ? '📋 Préparation' : `Ingrédient ${index + 1}`}
                      </Text>
                      <TouchableOpacity onPress={() => removeIngredient(index)}>
                        <Text style={{ color: '#ff4444' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {/* === Ingrédient de type PREPARATION === */}
                    {ing.ingredient_type === 'preparation' ? (
                      <>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF9800', marginBottom: 8 }}>
                          {ing.preparation_name || ing.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: '#666' }}>Quantité:</Text>
                          <TextInput
                            style={{ 
                              flex: 1, 
                              borderWidth: 1, 
                              borderColor: '#FF9800', 
                              borderRadius: 4, 
                              padding: 8,
                              backgroundColor: '#fff'
                            }}
                            keyboardType="decimal-pad"
                            value={ing.quantity_used?.toString()}
                            onChangeText={(v) => {
                              const normalized = v.replace(',', '.');
                              updateIngredient(index, 'quantity_used', normalized);
                            }}
                          />
                          <Text style={{ color: '#666' }}>{ing.unit_used || 'portion'}</Text>
                        </View>
                        <Text style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
                          Coût estimé: {(ing.cost || 0).toFixed(2)}€
                        </Text>
                      </>
                    ) : (
                      <>
                        {/* === Ingrédient STANDARD === */}
                        {/* Nom ingrédient */}
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 8 }}
                          placeholder="Nom (ex: Rhum)"
                          value={ing.name}
                          onChangeText={(v) => updateIngredient(index, 'name', v)}
                        />
                        
                        {/* Quantité utilisée */}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
                            placeholder="Qté utilisée"
                            keyboardType="decimal-pad"
                            value={ing.quantity_used?.toString()}
                            onChangeText={(v) => {
                              const normalized = v.replace(',', '.');
                              updateIngredient(index, 'quantity_used', normalized);
                            }}
                          />
                          <View style={{ width: 80, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, flexDirection: 'row', alignItems: 'center' }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                              {units.map(u => (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => updateIngredient(index, 'unit_used', u)}
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 10,
                                    backgroundColor: ing.unit_used === u ? primaryColor : 'transparent',
                                    borderRadius: 4
                                  }}
                                >
                                  <Text style={{ fontSize: 12, color: ing.unit_used === u ? secondaryColor : '#333' }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                        
                        {/* Quantité achetée */}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <TextInput
                            style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
                            placeholder="Qté achetée"
                            keyboardType="decimal-pad"
                            value={ing.quantity_purchased?.toString()}
                            onChangeText={(v) => {
                              const normalized = v.replace(',', '.');
                              updateIngredient(index, 'quantity_purchased', normalized);
                            }}
                          />
                          <View style={{ width: 80, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, flexDirection: 'row', alignItems: 'center' }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                              {units.map(u => (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => updateIngredient(index, 'unit_purchased', u)}
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 10,
                                    backgroundColor: ing.unit_purchased === u ? primaryColor : 'transparent',
                                    borderRadius: 4
                                  }}
                                >
                                  <Text style={{ fontSize: 12, color: ing.unit_purchased === u ? secondaryColor : '#333' }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                        
                        {/* Prix d'achat */}
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
                          placeholder="Prix d'achat (€)"
                          keyboardType="decimal-pad"
                          value={ing.purchase_price?.toString()}
                          onChangeText={(v) => {
                            const normalized = v.replace(',', '.');
                            updateIngredient(index, 'purchase_price', normalized);
                          }}
                        />
                      </>
                    )}
                  </View>
                ))}
                
                {/* Boutons pour ajouter des ingrédients */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: primaryColor, padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={addIngredient}
                  >
                    <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>+ Ingrédient</Text>
                  </TouchableOpacity>
                  {availablePreparations.length > 0 && (
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#FF9800', padding: 12, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setShowAddPreparationIngredient(true)}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>+ Préparation</Text>
                    </TouchableOpacity>
                  )}
                </View>
                  </>
                )}
                
                {/* Champ Notes / Instructions (pour tous les types) */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: 'bold', color: primaryColor, marginBottom: 8 }}>📝 Notes / Instructions (optionnel)</Text>
                  <TextInput
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 8, 
                      padding: 12, 
                      minHeight: 100,
                      textAlignVertical: 'top'
                    }}
                    placeholder="Ex: Mélanger 4cl de rhum, ajouter décoration, servir frais..."
                    value={newProductNotes}
                    onChangeText={setNewProductNotes}
                    multiline
                    numberOfLines={4}
                    data-testid="product-notes-input"
                  />
                </View>
                
                {/* Boutons action */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#ccc', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => { setShowAddProduct(false); setShowEditProduct(false); resetProductForm(); }}
                  >
                    <Text style={{ fontWeight: 'bold' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={showEditProduct ? handleUpdateProduct : handleCreateProduct}
                    disabled={isLoading}
                    data-testid="save-product-btn"
                  >
                    <Text style={{ fontWeight: 'bold', color: '#fff' }}>{isLoading ? '...' : (showEditProduct ? 'Modifier' : 'Créer')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
        
        {/* Modal pour sélectionner une préparation comme ingrédient */}
        {showAddPreparationIngredient && (
          <Modal visible={true} transparent animationType="slide">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: secondaryColor, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '60%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>Sélectionner une préparation</Text>
                  <TouchableOpacity onPress={() => setShowAddPreparationIngredient(false)}>
                    <Text style={{ fontSize: 18, color: '#999' }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  {availablePreparations.length === 0 ? (
                    <Text style={{ color: '#666', textAlign: 'center', padding: 20 }}>
                      Aucune préparation disponible. Créez d'abord des préparations dans vos sections.
                    </Text>
                  ) : (
                    availablePreparations.map((prep: any) => (
                      <TouchableOpacity
                        key={prep.product_id}
                        style={{
                          backgroundColor: '#FFF3E0',
                          padding: 16,
                          borderRadius: 8,
                          marginBottom: 8,
                          borderLeftWidth: 4,
                          borderLeftColor: '#FF9800'
                        }}
                        onPress={() => addPreparationAsIngredient(prep)}
                      >
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{prep.name}</Text>
                        <Text style={{ color: '#666', marginTop: 4 }}>
                          Rendement: {prep.yield_quantity} {prep.yield_unit} • Coût/unité: {prep.cost_per_unit?.toFixed(4)}€
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </>
    );
  };
  
  // --- RENDER ---
  
  // Vue principale: Choix Bar / Cuisine
  if (currentView === 'main') {
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="fiche-technique-screen" addBottomPadding={true}>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {/* Header avec bouton retour */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setCurrentScreen('menuRestaurant')} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>Fiche Technique</Text>
            {!canEditFicheTechnique() && (
              <View style={{ marginLeft: 8, backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Lecture seule</Text>
              </View>
            )}
          </View>
          
          {/* Boutons Bar et Cuisine - seulement les catégories autorisées */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 20 }}>
            {canViewCategory('bar') && (
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: primaryColor,
                  padding: 24,
                  borderRadius: 12,
                  alignItems: 'center'
                }}
                onPress={() => { setSelectedCategory('bar'); setCurrentView('sections'); }}
                data-testid="fiche-bar-btn"
              >
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🍸</Text>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: secondaryColor }}>BAR</Text>
                <Text style={{ fontSize: 14, color: secondaryColor, opacity: 0.8, marginTop: 4 }}>
                  {barSections.length} section{barSections.length > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
            
            {canViewCategory('cuisine') && (
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: primaryColor,
                  padding: 24,
                  borderRadius: 12,
                  alignItems: 'center'
                }}
                onPress={() => { setSelectedCategory('cuisine'); setCurrentView('sections'); }}
                data-testid="fiche-cuisine-btn"
              >
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🍽️</Text>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: secondaryColor }}>CUISINE</Text>
                <Text style={{ fontSize: 14, color: secondaryColor, opacity: 0.8, marginTop: 4 }}>
                  {cuisineSections.length} section{cuisineSections.length > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Bouton Export - visible si permission export */}
          {canExportPdfExcel && (
            <TouchableOpacity
              style={{
                backgroundColor: '#4CAF50',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 24
              }}
              onPress={() => { setCurrentView('export'); setSelectedForExport([]); }}
              data-testid="fiche-export-btn"
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>📤 Exporter en PDF / Excel</Text>
            </TouchableOpacity>
          )}
          
          {/* Bouton Analyse des Marges - visible si permission analyse */}
          {canAnalyzeMargins && (
            <TouchableOpacity
              style={{
                backgroundColor: '#9C27B0',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 12
              }}
              onPress={() => { loadMarginAnalysis(); setCurrentView('marginAnalysis'); }}
              data-testid="fiche-margin-analysis-btn"
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>📊 Analyse des Marges</Text>
            </TouchableOpacity>
          )}
          
          {/* Bouton Archivage - visible si peut supprimer des produits */}
          {canDeleteProduct && (
            <TouchableOpacity
              style={{
                backgroundColor: '#607D8B',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 12
              }}
              onPress={() => { loadArchivedProducts(); setCurrentView('archived'); }}
              data-testid="fiche-archived-btn"
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>Archivage</Text>
            </TouchableOpacity>
          )}
          
          {/* Bouton Import PDF - visible si peut ajouter des produits */}
          {canAddProduct && (
            <TouchableOpacity
              style={{
                backgroundColor: '#FF5722',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 12
              }}
              onPress={() => setShowImportPdfModal(true)}
              data-testid="fiche-import-pdf-btn"
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>📥 Importer depuis PDF/Excel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        
        {/* Modal Import PDF */}
        {showImportPdfModal && (
          <Modal visible={true} transparent animationType="slide">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: secondaryColor, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '90%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>📥 Importer depuis PDF/Excel</Text>
                  <TouchableOpacity onPress={() => { setShowImportPdfModal(false); setPdfExtractedProducts([]); setSelectedImportProducts([]); }}>
                    <Text style={{ fontSize: 24, color: '#999' }}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                {pdfExtractedProducts.length === 0 ? (
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: '#333', fontSize: 16, marginBottom: 16, textAlign: 'center' }}>
                      Chargez les produits extraits du PDF pour les importer dans vos fiches techniques.
                    </Text>
                    
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#FF5722',
                        padding: 16,
                        borderRadius: 12,
                        alignItems: 'center',
                        marginBottom: 12
                      }}
                      onPress={async () => {
                        setIsLoadingPdf(true);
                        // Données extraites du PDF (hardcodées à partir de l'extraction précédente)
                        const extractedData = [
                          { product_name: "Côte de boeuf", section_name: "Suggestions du Chef", category: "cuisine", selling_price: 35.90, instructions_or_notes: "Servie avec Frites maison, Salade de mesclun et 2 Sauces au choix", ingredients: [{ name: "Côte de boeuf", quantity: 500, unit: "g" }] },
                          { product_name: "Meule de Parmesan", section_name: "Suggestions du Chef", category: "cuisine", selling_price: 29.90, instructions_or_notes: "Linguines préparées devant vous dans la meule de parmesan, flambée au Cognac", ingredients: [] },
                          { product_name: "Plat du jour", section_name: "À l'ardoise", category: "cuisine", selling_price: 15.90, instructions_or_notes: "Uniquement les midis du lundi au vendredi", ingredients: [] },
                          { product_name: "Menu Enfant", section_name: "Menu Enfant", category: "cuisine", selling_price: 14.90, instructions_or_notes: "Pour les enfants jusqu'à 12 ans", ingredients: [] },
                          { product_name: "Frites maison", section_name: "Nos Apéros", category: "cuisine", selling_price: 3.50, ingredients: [] },
                          { product_name: "Frites au cheddar & Piment d'Espelette", section_name: "Nos Apéros", category: "cuisine", selling_price: 4.20, ingredients: [] },
                          { product_name: "Planche de charcuterie", section_name: "Nos Apéros", category: "cuisine", selling_price: 15.90, ingredients: [{ name: "Saucisson sec" }, { name: "Rillettes de canard" }, { name: "Jambon Serrano" }, { name: "Chorizo" }] },
                          { product_name: "Planche de fromage", section_name: "Nos Apéros", category: "cuisine", selling_price: 14.90, ingredients: [{ name: "Brie" }, { name: "Cantal d'Auvergne" }, { name: "Tomme blanche" }, { name: "Morbier" }] },
                          { product_name: "Planche mixte", section_name: "Nos Apéros", category: "cuisine", selling_price: 16.90, ingredients: [{ name: "Fromage" }, { name: "Charcuterie" }] },
                          { product_name: "Planche au Poulet", section_name: "Nos Apéros", category: "cuisine", selling_price: 15.90, ingredients: [{ name: "Wings et ailes de poulet" }, { name: "Sauce BBQ" }] },
                          { product_name: "Planche de Tapas", section_name: "Nos Apéros", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Bouchées de camembert pané" }, { name: "Poulet Tex-Mex" }, { name: "Bœuf sauté à l'asiatique" }, { name: "Légumes grillés" }] },
                          { product_name: "Bruschetta au jambon Serrano", section_name: "Nos Snackings", category: "cuisine", selling_price: 16.90, ingredients: [{ name: "Pain de campagne" }, { name: "Tomates anciennes" }, { name: "Jambon Serrano" }, { name: "Fondue de mozzarella" }] },
                          { product_name: "Bruschetta au saumon fumé", section_name: "Nos Snackings", category: "cuisine", selling_price: 17.90, ingredients: [{ name: "Pain de campagne" }, { name: "Saumon fumé" }, { name: "Avocat" }] },
                          { product_name: "Camembert rôti coulant", section_name: "Nos Salades", category: "cuisine", selling_price: 16.90, ingredients: [{ name: "Salade de mesclun" }, { name: "Tomates cerises" }, { name: "PDT grenaille" }] },
                          { product_name: "Salade végétarienne au Portobello", section_name: "Nos Salades", category: "cuisine", selling_price: 17.90, ingredients: [{ name: "Salade romaine" }, { name: "Portobello confit" }, { name: "Avocat" }, { name: "Tomates cerises" }] },
                          { product_name: "Salade Océane", section_name: "Nos Salades", category: "cuisine", selling_price: 19.90, ingredients: [{ name: "Salade romaine" }, { name: "Saumon fumé" }, { name: "Tomates cerises" }, { name: "Œuf dur" }] },
                          { product_name: "Salade César", section_name: "Nos Salades", category: "cuisine", selling_price: 18.50, ingredients: [{ name: "Salade romaine" }, { name: "Crispy chicken" }, { name: "Copeaux de parmesan" }, { name: "Croûtons" }] },
                          { product_name: "Salade de Bœuf Saveur thaïlandaise", section_name: "Nos Salades", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Salade de mesclun" }, { name: "Bœuf mariné au Teriyaki" }, { name: "Concombre" }, { name: "Cacahuètes" }] },
                          { product_name: "Entrée du jour", section_name: "Nos Entrées", category: "cuisine", selling_price: 7.90, instructions_or_notes: "Voir l'ardoise", ingredients: [] },
                          { product_name: "Oeuf cocotte", section_name: "Nos Entrées", category: "cuisine", selling_price: 9.90, ingredients: [{ name: "Crème de comté" }, { name: "Noisettes torréfiées" }, { name: "Lardons" }, { name: "Œuf" }] },
                          { product_name: "Rillettes de Canard parfumées à l'orange", section_name: "Nos Entrées", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Salade de mesclun" }, { name: "Toasts de pain aux épices" }] },
                          { product_name: "Petite tartiflette savoyarde", section_name: "Nos Entrées", category: "cuisine", selling_price: 10.90, ingredients: [{ name: "Salade de mesclun" }, { name: "Chips de panais" }, { name: "Fondue de reblochon" }] },
                          { product_name: "Croquettes de brie", section_name: "Nos Entrées", category: "cuisine", selling_price: 9.90, ingredients: [{ name: "Salade de mesclun" }, { name: "Miel" }, { name: "Pommes vertes" }] },
                          { product_name: "Tatin de foie gras de canard", section_name: "Nos Entrées", category: "cuisine", selling_price: 13.90, ingredients: [{ name: "Pommes caramélisées flambées au cognac" }, { name: "Salade de mesclun" }] },
                          { product_name: "Salade Paysanne", section_name: "Nos Entrées", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Salade de mesclun" }, { name: "Jambon Serrano" }, { name: "Croquettes de brie" }, { name: "Noix" }] },
                          { product_name: "Saumon Gravlax à l'aneth", section_name: "Nos Entrées", category: "cuisine", selling_price: 12.90, ingredients: [{ name: "Salade de Mesclun" }, { name: "Sauce Ranch" }] },
                          { product_name: "Velouté de Potimarron aux châtaignes", section_name: "Nos Entrées", category: "cuisine", selling_price: 7.90, ingredients: [{ name: "Croûtons" }, { name: "Crème fraîche" }] },
                          { product_name: "Burger du Cercle", section_name: "Nos Burgers", category: "cuisine", selling_price: 18.90, instructions_or_notes: "Supp. steak 4,90€", ingredients: [{ name: "Pain burger artisanal" }, { name: "Steak de bœuf charolais 150g" }, { name: "Fondue de cheddar" }, { name: "Bacon grillé" }] },
                          { product_name: "Burger Crispy chicken au BBQ", section_name: "Nos Burgers", category: "cuisine", selling_price: 18.50, ingredients: [{ name: "Pain burger artisanal" }, { name: "Crispy Chicken" }, { name: "Fondue de cheddar" }, { name: "Sauce BBQ" }] },
                          { product_name: "Burger Veggie au Portobello", section_name: "Nos Burgers", category: "cuisine", selling_price: 17.90, ingredients: [{ name: "Pain burger artisanal" }, { name: "Confit de champignon Portobello" }, { name: "Purée d'avocat" }] },
                          { product_name: "Burger Montagnard Chicken", section_name: "Nos Burgers", category: "cuisine", selling_price: 19.90, ingredients: [{ name: "Pain burger artisanal" }, { name: "Crispy chicken" }, { name: "Galette de pomme de terre" }, { name: "Fondue de morbier" }] },
                          { product_name: "Burger Montagnard Boeuf", section_name: "Nos Burgers", category: "cuisine", selling_price: 20.90, ingredients: [{ name: "Pain burger artisanal" }, { name: "Steak de bœuf charolais 150g" }, { name: "Fondue de morbier" }] },
                          { product_name: "Tartiflette savoyarde", section_name: "Nos Viandes", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Lardons grillés" }, { name: "Fondue de reblechon" }, { name: "Salade de Mesclun" }] },
                          { product_name: "Parmentier de confit canard", section_name: "Nos Viandes", category: "cuisine", selling_price: 21.90, ingredients: [{ name: "Gratiné au parmesan" }, { name: "Purée de pommes de terre" }] },
                          { product_name: "Pièce de bœuf Angus", section_name: "Nos Viandes", category: "cuisine", selling_price: 19.90, ingredients: [{ name: "Frites maison" }, { name: "Salade" }, { name: "Sauce échalote moutardé" }] },
                          { product_name: "Côte de porc Cantal", section_name: "Nos Viandes", category: "cuisine", selling_price: 20.90, ingredients: [{ name: "Gratin dauphinois" }, { name: "Sauce au poivre" }] },
                          { product_name: "Magret de canard Français", section_name: "Nos Viandes", category: "cuisine", selling_price: 22.90, ingredients: [{ name: "Pommes de terre grenaille" }, { name: "Sauce au poivre" }] },
                          { product_name: "Poulet rôti au four parfumé au romarin", section_name: "Nos Viandes", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Purée de pommes de terre" }, { name: "Jus de viande" }] },
                          { product_name: "Filet de bœuf VBF", section_name: "Nos Viandes", category: "cuisine", selling_price: 29.90, ingredients: [{ name: "Gratin dauphinois" }, { name: "Sauce au roquefort" }] },
                          { product_name: "Tartare de bœuf au couteau", section_name: "Nos Viandes", category: "cuisine", selling_price: 17.90, ingredients: [{ name: "Câpres" }, { name: "Cornichons" }, { name: "Persil" }, { name: "Frites maison" }] },
                          { product_name: "Tartare de bœuf à l'italienne", section_name: "Nos Viandes", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Tomates confites" }, { name: "Olives noires" }, { name: "Copeaux de parmesan" }] },
                          { product_name: "Souris d'agneau braisé", section_name: "Nos Viandes", category: "cuisine", selling_price: 27.90, instructions_or_notes: "Au thym et au vin rouge", ingredients: [{ name: "Purée de pommes de terre" }] },
                          { product_name: "Pavé de saumon à l'oseille", section_name: "Nos Poissons", category: "cuisine", selling_price: 21.90, ingredients: [{ name: "Riz basmati" }, { name: "Carottes confites" }, { name: "Crème d'oseille" }] },
                          { product_name: "Filet de bar grillé", section_name: "Nos Poissons", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Poêlée de julienne de légumes" }, { name: "Sauce au pesto vert" }] },
                          { product_name: "Fish & Chips de Cabillaud", section_name: "Nos Poissons", category: "cuisine", selling_price: 17.90, ingredients: [{ name: "Frites maison" }, { name: "Salade" }, { name: "Sauce ranch" }] },
                          { product_name: "Cabillaud façon Blanquette", section_name: "Nos Poissons", category: "cuisine", selling_price: 19.90, ingredients: [{ name: "Riz basmati" }, { name: "Légumes croquant" }, { name: "Beurre blanc citronné" }] },
                          { product_name: "Risotto cremeux aux Saint-Jacques", section_name: "Nos Poissons", category: "cuisine", selling_price: 26.90, ingredients: [{ name: "Crème de truffe noire" }, { name: "Copeaux de parmesan" }] },
                          { product_name: "Spaghettis à la Bolognaise", section_name: "Nos Pâtes", category: "cuisine", selling_price: 18.90, ingredients: [{ name: "Sauce Bolognaise" }, { name: "Jaune d'œuf" }, { name: "Emmental rapé" }] },
                          { product_name: "Penne crémeuses aux trois fromages", section_name: "Nos Pâtes", category: "cuisine", selling_price: 16.90, ingredients: [{ name: "Crème au bleu" }, { name: "Comté" }, { name: "Copeaux de parmesan" }] },
                          { product_name: "Dessert du jour", section_name: "Nos Desserts", category: "cuisine", selling_price: 7.90, instructions_or_notes: "Voir l'ardoise", ingredients: [] },
                          { product_name: "Brioche perdue", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Caramel au beurre salé" }, { name: "Une boule de glace vanille" }] },
                          { product_name: "Crème brûlée au praliné", section_name: "Nos Desserts", category: "cuisine", selling_price: 7.90, ingredients: [{ name: "Parfumé au praliné" }, { name: "Noisettes torréfiées" }] },
                          { product_name: "Crumble aux pommes caramélisées", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Crumble aux amandes" }, { name: "Boule de glace caramel" }] },
                          { product_name: "Tiramisu", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.50, ingredients: [{ name: "Au café" }] },
                          { product_name: "Moelleux au chocolat coeur coulant à la pistache", section_name: "Nos Desserts", category: "cuisine", selling_price: 9.40, ingredients: [{ name: "Crème anglaise à la vanille" }, { name: "Éclats de pistache" }] },
                          { product_name: "Tartelette aux poires-amandine", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Crème d'amande" }, { name: "Chantilly" }] },
                          { product_name: "Profiterole au chocolat", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Chou" }, { name: "Glace au choix" }, { name: "Sauce chocolat maison" }] },
                          { product_name: "Assiette de Fromage", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Brie" }, { name: "Cantal d'Auvergne" }, { name: "Tomme blanche" }, { name: "Morbier" }] },
                          { product_name: "Café gourmand", section_name: "Nos Desserts", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Assortiment de trois desserts" }] },
                          { product_name: "Gaufre Le Cercle", section_name: "Nos Gaufres Maison", category: "cuisine", selling_price: 9.50, ingredients: [{ name: "Glace vanille" }, { name: "Chocolat chaud" }, { name: "Chantilly" }] },
                          { product_name: "Gaufre Sucre", section_name: "Nos Gaufres Maison", category: "cuisine", selling_price: 6.90, ingredients: [] },
                          { product_name: "Gaufre Nutella", section_name: "Nos Gaufres Maison", category: "cuisine", selling_price: 8.40, ingredients: [] },
                          { product_name: "Gaufre Caramel Beurre salé", section_name: "Nos Gaufres Maison", category: "cuisine", selling_price: 7.40, ingredients: [] },
                          { product_name: "Crêpe Le Cercle", section_name: "Nos Crêpes Maison", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Glace vanille" }, { name: "Chocolat chaud" }, { name: "Chantilly" }] },
                          { product_name: "Crêpe Sucre", section_name: "Nos Crêpes Maison", category: "cuisine", selling_price: 6.50, ingredients: [] },
                          { product_name: "Crêpe Nutella", section_name: "Nos Crêpes Maison", category: "cuisine", selling_price: 7.90, ingredients: [] },
                          { product_name: "Crêpe Chocolat / Banane", section_name: "Nos Crêpes Maison", category: "cuisine", selling_price: 8.40, ingredients: [] },
                          { product_name: "Dame Blanche", section_name: "Nos Glaces Artisanales", category: "cuisine", selling_price: 6.90, ingredients: [{ name: "2 Boules vanille" }, { name: "Sauce chocolat maison" }, { name: "Chantilly" }] },
                          { product_name: "L'italienne", section_name: "Nos Glaces Artisanales", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "Vanille" }, { name: "Pistache" }, { name: "Stracciatella" }] },
                          { product_name: "Café Liégeois", section_name: "Nos Glaces Artisanales", category: "cuisine", selling_price: 6.90, ingredients: [{ name: "2 Boules café" }, { name: "Son coulis assorti" }, { name: "Chantilly" }] },
                          { product_name: "Chocolat Liégeois", section_name: "Nos Glaces Artisanales", category: "cuisine", selling_price: 7.90, ingredients: [{ name: "2 Boules Chocolat" }, { name: "Son coulis assorti" }] },
                          { product_name: "Coupe de glace Tatin", section_name: "Nos Glaces Artisanales", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "1 Boule vanille" }, { name: "Pommes caramélisées" }, { name: "Crumble" }] },
                          { product_name: "Colonel", section_name: "Nos Glaces Artisanales", category: "cuisine", selling_price: 8.90, ingredients: [{ name: "2 Boules Citron vert" }, { name: "Vodka" }] },
                          { product_name: "Garniture - Petite Frites maison", section_name: "Garnitures en suppléments", category: "cuisine", selling_price: 3.50, ingredients: [] },
                          { product_name: "Garniture - Purée de pommes de terre", section_name: "Garnitures en suppléments", category: "cuisine", selling_price: 4.50, ingredients: [] },
                          { product_name: "Garniture - Pâtes", section_name: "Garnitures en suppléments", category: "cuisine", selling_price: 3.60, ingredients: [] },
                          { product_name: "Garniture - Riz basmati", section_name: "Garnitures en suppléments", category: "cuisine", selling_price: 3.50, ingredients: [] },
                          { product_name: "Garniture - Gratin dauphinois", section_name: "Garnitures en suppléments", category: "cuisine", selling_price: 4.70, ingredients: [] },
                          { product_name: "Sauce cheddar au piment d'espelette", section_name: "Sauces en suppléments", category: "cuisine", selling_price: 2.00, ingredients: [] },
                          { product_name: "Sauce moutardée aux échalotes", section_name: "Sauces en suppléments", category: "cuisine", selling_price: 2.00, ingredients: [] },
                          { product_name: "Sauce Poivre", section_name: "Sauces en suppléments", category: "cuisine", selling_price: 2.00, ingredients: [] }
                        ];
                        setPdfExtractedProducts(extractedData);
                        setIsLoadingPdf(false);
                      }}
                      disabled={isLoadingPdf}
                      data-testid="load-pdf-data-btn"
                    >
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>
                        {isLoadingPdf ? 'Chargement...' : '📄 Charger les produits du PDF'}
                      </Text>
                    </TouchableOpacity>
                    
                    <Text style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>
                      Les données du PDF fusionné(7).pdf seront chargées
                    </Text>
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    {/* Filtres */}
                    <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 8,
                          backgroundColor: importCategoryFilter === 'all' ? primaryColor : '#e0e0e0',
                          borderRadius: 8,
                          alignItems: 'center'
                        }}
                        onPress={() => setImportCategoryFilter('all')}
                      >
                        <Text style={{ color: importCategoryFilter === 'all' ? '#fff' : '#333', fontWeight: 'bold' }}>Tous</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 8,
                          backgroundColor: importCategoryFilter === 'bar' ? '#1B4965' : '#e0e0e0',
                          borderRadius: 8,
                          alignItems: 'center'
                        }}
                        onPress={() => setImportCategoryFilter('bar')}
                      >
                        <Text style={{ color: importCategoryFilter === 'bar' ? '#fff' : '#333', fontWeight: 'bold' }}>Bar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 8,
                          backgroundColor: importCategoryFilter === 'cuisine' ? '#2C5F2D' : '#e0e0e0',
                          borderRadius: 8,
                          alignItems: 'center'
                        }}
                        onPress={() => setImportCategoryFilter('cuisine')}
                      >
                        <Text style={{ color: importCategoryFilter === 'cuisine' ? '#fff' : '#333', fontWeight: 'bold' }}>Cuisine</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {/* Compteur de sélection */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ color: '#333', fontWeight: 'bold' }}>
                        {selectedImportProducts.length} / {pdfExtractedProducts.filter(p => importCategoryFilter === 'all' || p.category === importCategoryFilter).length} sélectionné(s)
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            const filtered = pdfExtractedProducts.filter(p => importCategoryFilter === 'all' || p.category === importCategoryFilter);
                            setSelectedImportProducts(filtered.map(p => p.product_name));
                          }}
                        >
                          <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>Tout sélectionner</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelectedImportProducts([])}>
                          <Text style={{ color: '#F44336', fontWeight: 'bold' }}>Désélectionner</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    {/* Liste des produits */}
                    <ScrollView style={{ maxHeight: 350 }}>
                      {(() => {
                        const filteredProducts = pdfExtractedProducts.filter(p => importCategoryFilter === 'all' || p.category === importCategoryFilter);
                        const groupedBySection: { [key: string]: any[] } = {};
                        filteredProducts.forEach(p => {
                          if (!groupedBySection[p.section_name]) groupedBySection[p.section_name] = [];
                          groupedBySection[p.section_name].push(p);
                        });
                        
                        return Object.entries(groupedBySection).map(([sectionName, sectionProducts]) => (
                          <View key={sectionName} style={{ marginBottom: 12 }}>
                            <View style={{ 
                              backgroundColor: (sectionProducts[0] as any).category === 'bar' ? '#1B4965' : '#2C5F2D', 
                              padding: 8, 
                              borderRadius: 4,
                              marginBottom: 4
                            }}>
                              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{sectionName}</Text>
                            </View>
                            {sectionProducts.map((product: any) => (
                              <TouchableOpacity
                                key={product.product_name}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  padding: 8,
                                  backgroundColor: selectedImportProducts.includes(product.product_name) ? '#E8F5E9' : '#f9f9f9',
                                  borderRadius: 4,
                                  marginBottom: 2,
                                  borderLeftWidth: 3,
                                  borderLeftColor: selectedImportProducts.includes(product.product_name) ? '#4CAF50' : '#ccc'
                                }}
                                onPress={() => {
                                  if (selectedImportProducts.includes(product.product_name)) {
                                    setSelectedImportProducts(prev => prev.filter(n => n !== product.product_name));
                                  } else {
                                    setSelectedImportProducts(prev => [...prev, product.product_name]);
                                  }
                                }}
                              >
                                <View style={{ 
                                  width: 20, 
                                  height: 20, 
                                  borderRadius: 4, 
                                  borderWidth: 2, 
                                  borderColor: selectedImportProducts.includes(product.product_name) ? '#4CAF50' : '#ccc',
                                  backgroundColor: selectedImportProducts.includes(product.product_name) ? '#4CAF50' : '#fff',
                                  marginRight: 8,
                                  justifyContent: 'center',
                                  alignItems: 'center'
                                }}>
                                  {selectedImportProducts.includes(product.product_name) && (
                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontWeight: 'bold', color: '#333' }}>{product.product_name}</Text>
                                  {product.ingredients && product.ingredients.length > 0 && (
                                    <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>
                                      {product.ingredients.map((i: any) => i.name).join(', ')}
                                    </Text>
                                  )}
                                </View>
                                {product.selling_price && (
                                  <Text style={{ fontWeight: 'bold', color: '#4CAF50' }}>{product.selling_price.toFixed(2)}€</Text>
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        ));
                      })()}
                    </ScrollView>
                    
                    {/* Bouton Importer */}
                    <TouchableOpacity
                      style={{
                        backgroundColor: selectedImportProducts.length > 0 ? '#4CAF50' : '#ccc',
                        padding: 16,
                        borderRadius: 12,
                        alignItems: 'center',
                        marginTop: 16
                      }}
                      disabled={selectedImportProducts.length === 0 || isLoading}
                      onPress={async () => {
                        if (selectedImportProducts.length === 0) return;
                        
                        setIsLoading(true);
                        try {
                          const productsToImport = pdfExtractedProducts
                            .filter(p => selectedImportProducts.includes(p.product_name))
                            .map(p => ({
                              product_name: p.product_name,
                              section_name: p.section_name,
                              category: p.category,
                              ingredients: p.ingredients || [],
                              selling_price: p.selling_price,
                              instructions_or_notes: p.instructions_or_notes,
                              product_type: 'standard'
                            }));
                          
                          const result = await apiRequest('/fiche-products/import-from-pdf', {
                            method: 'POST',
                            body: JSON.stringify({
                              products: productsToImport,
                              create_sections: true
                            })
                          });
                          
                          alert(`Import réussi!\n\n✅ ${result.imported_count} produit(s) importé(s)\n⏭️ ${result.skipped_count} produit(s) ignoré(s)\n📁 ${result.created_sections?.length || 0} section(s) créée(s)`);
                          
                          // Recharger les données
                          await loadSections();
                          await loadProducts();
                          
                          // Fermer le modal
                          setShowImportPdfModal(false);
                          setPdfExtractedProducts([]);
                          setSelectedImportProducts([]);
                        } catch (error: any) {
                          console.error('Import error:', error);
                          alert(error.message || 'Erreur lors de l\'import');
                        }
                        setIsLoading(false);
                      }}
                      data-testid="confirm-import-btn"
                    >
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>
                        {isLoading ? 'Import en cours...' : `Importer ${selectedImportProducts.length} produit(s)`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaWrapper>
    );
  }
  
  // Vue des Sections (d'une catégorie)
  if (currentView === 'sections') {
    const categorySections = selectedCategory === 'bar' ? barSections : cuisineSections;
    const categoryTitle = selectedCategory === 'bar' ? 'Bar' : 'Cuisine';
    const categoryEmoji = selectedCategory === 'bar' ? '🍸' : '🍽️';
    
    // Fonction pour obtenir les produits d'une section
    const getSectionProducts = (sectionId: string) => {
      return products.filter((p: any) => p.section_id === sectionId).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    };
    
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="fiche-sections-screen" addBottomPadding={true}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => { setCurrentView('main'); setSelectedCategory(null); }} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>{categoryEmoji} {categoryTitle}</Text>
          </View>
          
          {/* Toggle Avec/Sans photos */}
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: showPhotos ? primaryColor : '#e0e0e0',
                borderTopLeftRadius: 8,
                borderBottomLeftRadius: 8,
                alignItems: 'center'
              }}
              onPress={() => setShowPhotos(true)}
            >
              <Text style={{ color: showPhotos ? secondaryColor : '#333', fontWeight: showPhotos ? 'bold' : 'normal', fontSize: 13 }}>
                📷 Avec photos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: !showPhotos ? primaryColor : '#e0e0e0',
                borderTopRightRadius: 8,
                borderBottomRightRadius: 8,
                alignItems: 'center'
              }}
              onPress={() => setShowPhotos(false)}
            >
              <Text style={{ color: !showPhotos ? secondaryColor : '#333', fontWeight: !showPhotos ? 'bold' : 'normal', fontSize: 13 }}>
                📋 Sans photos
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Liste des sections avec produits inline */}
          <ScrollView style={{ flex: 1 }}>
            {categorySections.map((section: any) => (
              <View key={section.section_id} style={{ marginBottom: 20 }}>
                {/* Header de section */}
                <View
                  style={{
                    backgroundColor: primaryColor,
                    padding: 16,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  data-testid={`section-${section.section_id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: secondaryColor }}>{section.name}</Text>
                    <Text style={{ fontSize: 14, color: secondaryColor, opacity: 0.7 }}>
                      {getSectionProducts(section.section_id).length} produit(s)
                    </Text>
                  </View>
                  {/* Boutons d'édition - pour Manager OU staff avec permissions */}
                  {(canAddProduct || canEditSection || canDeleteSection) && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {canAddProduct && (
                      <TouchableOpacity
                        onPress={() => { setSelectedSection(section); resetProductForm(); loadMenuSelectorData(); setShowMenuSelector(true); }}
                        style={{ padding: 8, backgroundColor: '#4CAF50', borderRadius: 4 }}
                        data-testid={`add-product-section-${section.section_id}`}
                      >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>+ Produit</Text>
                      </TouchableOpacity>
                      )}
                      {canEditSection && (
                      <TouchableOpacity
                        onPress={() => { setSelectedSection(section); setEditingSectionName(section.name); setShowEditSection(true); }}
                        style={{ padding: 8, backgroundColor: secondaryColor, borderRadius: 4 }}
                        data-testid={`edit-section-${section.section_id}`}
                      >
                        <Text style={{ color: primaryColor }}>✏️</Text>
                      </TouchableOpacity>
                      )}
                      {canDeleteSection && (
                      <TouchableOpacity
                        onPress={() => handleDeleteSection(section.section_id)}
                        style={{ padding: 8, backgroundColor: '#ff4444', borderRadius: 4 }}
                        data-testid={`delete-section-${section.section_id}`}
                      >
                        <Text style={{ color: '#fff' }}>🗑️</Text>
                      </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                
                {/* Produits de la section */}
                <View style={{ paddingLeft: 12, paddingTop: 8 }}>
                  {getSectionProducts(section.section_id).map((product: any) => (
                    <TouchableOpacity
                      key={product.product_id}
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        padding: 12,
                        borderRadius: 6,
                        marginBottom: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderLeftWidth: 3,
                        borderLeftColor: primaryColor
                      }}
                      onPress={() => { setSelectedSection(section); setSelectedProduct(product); setCurrentView('productDetail'); }}
                      data-testid={`product-${product.product_id}`}
                    >
                      {/* Photo miniature */}
                      {showPhotos && product.photo_base64 && (
                        <TouchableOpacity 
                          onPress={(e) => { e.stopPropagation(); setFullScreenPhoto(product.photo_base64); }}
                          style={{ marginRight: 12 }}
                        >
                          <img 
                            src={product.photo_base64} 
                            alt={product.name}
                            style={{ width: 45, height: 45, borderRadius: 6, objectFit: 'cover' }}
                          />
                        </TouchableOpacity>
                      )}
                      {showPhotos && !product.photo_base64 && (
                        <View style={{ 
                          width: 45, 
                          height: 45, 
                          borderRadius: 6, 
                          backgroundColor: 'rgba(0,0,0,0.1)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: 12
                        }}>
                          <Text style={{ opacity: 0.5, fontSize: 18 }}>📷</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor }}>{product.name}</Text>
                        {/* Prix de revient et de vente - pour Manager OU staff avec permission analyse marges */}
                        {canAnalyzeMargins && (
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                            <Text style={{ fontSize: 13, color: '#666' }}>
                              Revient: {product.total_cost?.toFixed(2) || '0.00'}€
                            </Text>
                            {product.selling_price && (
                              <Text style={{ fontSize: 13, color: '#4CAF50', fontWeight: 'bold' }}>
                                Vente: {product.selling_price.toFixed(2)}€
                              </Text>
                            )}
                          </View>
                        )}
                        {/* Staff sans permissions voit juste le nombre d'ingrédients */}
                        {!canAnalyzeMargins && (
                          <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                            {product.ingredients?.length || 0} ingrédient{(product.ingredients?.length || 0) > 1 ? 's' : ''}
                          </Text>
                        )}
                      </View>
                      {/* Boutons d'édition - pour Manager OU staff avec permissions */}
                      {(canEditProduct || canDeleteProduct) && (
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {canEditProduct && (
                          <TouchableOpacity
                            onPress={(e) => { 
                              e.stopPropagation(); 
                              setSelectedProduct(product);
                              setEditingProduct(product);
                              setNewProductName(product.name);
                              setNewSellingPrice(product.selling_price ? String(product.selling_price) : '');
                              setShowEditProduct(true);
                            }}
                            style={{ padding: 6, backgroundColor: primaryColor, borderRadius: 4 }}
                            data-testid={`edit-product-${product.product_id}`}
                          >
                            <Text style={{ color: secondaryColor, fontSize: 12 }}>✏️</Text>
                          </TouchableOpacity>
                          )}
                          {canDeleteProduct && (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); handleDeleteProduct(product.product_id); }}
                            style={{ padding: 6, backgroundColor: '#ff4444', borderRadius: 4 }}
                            data-testid={`delete-product-${product.product_id}`}
                          >
                            <Text style={{ color: '#fff', fontSize: 12 }}>🗑️</Text>
                          </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                  
                  {/* Message si aucun produit */}
                  {getSectionProducts(section.section_id).length === 0 && (
                    <Text style={{ textAlign: 'center', color: '#999', padding: 12, fontStyle: 'italic' }}>
                      Aucun produit dans cette section
                    </Text>
                  )}
                </View>
              </View>
            ))}
            
            {categorySections.length === 0 && (
              <Text style={{ textAlign: 'center', color: primaryColor, marginTop: 20, opacity: 0.7 }}>
                {canAddSection ? "Aucune section. Ajoutez-en une !" : "Aucune section disponible."}
              </Text>
            )}
          </ScrollView>
          
          {/* Bouton Ajouter section - pour Manager OU staff avec permission */}
          {canAddSection && (
            <TouchableOpacity
              style={{
                backgroundColor: '#4CAF50',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 12
              }}
              onPress={() => setShowAddSection(true)}
              data-testid="add-section-btn"
            >
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>+ Ajouter une section</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Modal Ajouter Section */}
        {showAddSection && (
          <Modal visible={true} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
              <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>
                  Nouvelle section ({categoryTitle})
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: primaryColor,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    color: primaryColor
                  }}
                  placeholder="Nom de la section (ex: Cocktails)"
                  placeholderTextColor="#999"
                  value={newSectionName}
                  onChangeText={setNewSectionName}
                  data-testid="new-section-name-input"
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#ccc', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => { setShowAddSection(false); setNewSectionName(''); }}
                  >
                    <Text style={{ fontWeight: 'bold' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={handleCreateSection}
                    disabled={isLoading}
                    data-testid="create-section-btn"
                  >
                    <Text style={{ fontWeight: 'bold', color: '#fff' }}>{isLoading ? '...' : 'Créer'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        
        {/* Modal Modifier Section */}
        {showEditSection && (
          <Modal visible={true} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
              <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>
                  Modifier la section
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: primaryColor,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    color: primaryColor
                  }}
                  value={editingSectionName}
                  onChangeText={setEditingSectionName}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#ccc', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => { setShowEditSection(false); setEditingSectionName(''); }}
                  >
                    <Text style={{ fontWeight: 'bold' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: primaryColor, padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={handleUpdateSection}
                    disabled={isLoading}
                  >
                    <Text style={{ fontWeight: 'bold', color: secondaryColor }}>{isLoading ? '...' : 'Modifier'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        
        {/* Modal Sélecteur Menu Restaurant (Carte Food/Boisson) - Sections View */}
        {showMenuSelector && (
          <Modal visible={true} transparent animationType="slide">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
              
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor }}>
                    {selectedCategory === 'bar' ? '🍸 Sélectionner depuis Carte Boisson' : '🍽️ Sélectionner depuis Carte Food'}
                  </Text>
                  <TouchableOpacity onPress={() => { setShowMenuSelector(false); setMenuSelectorSearchQuery(''); }}>
                    <Text style={{ fontSize: 24, color: '#666' }}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Barre de recherche */}
                <View style={{ padding: 16, paddingTop: 12 }}>
                  <TextInput 
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#f9f9f9' }} 
                    placeholder={selectedCategory === 'bar' ? "Rechercher une boisson..." : "Rechercher un plat..."} 
                    value={menuSelectorSearchQuery} 
                    onChangeText={setMenuSelectorSearchQuery}
                  />
                </View>
                
                {isLoadingMenuSelector ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: '#666' }}>Chargement...</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 400 }}>
                    {menuSelectorSections
                      .filter((s: any) => !s.parent_section_id)
                      .map((section: any) => {
                        const sectionItems = menuSelectorItems.filter((i: any) => {
                          const matchesSection = i.section_id === section.section_id || 
                            menuSelectorSections.some((sub: any) => sub.parent_section_id === section.section_id && sub.section_id === i.section_id);
                          const matchesSearch = !menuSelectorSearchQuery || 
                            i.name.toLowerCase().includes(menuSelectorSearchQuery.toLowerCase());
                          return matchesSection && matchesSearch;
                        });
                        
                        if (sectionItems.length === 0) return null;
                        
                        return (
                          <View key={section.section_id} style={{ marginBottom: 8 }}>
                            <View style={{ backgroundColor: section.color || primaryColor, padding: 10, marginHorizontal: 16, borderRadius: 6, marginBottom: 4 }}>
                              <Text style={{ color: '#fff', fontWeight: '600' }}>{section.name}</Text>
                            </View>
                            {sectionItems.map((item: any) => (
                              <TouchableOpacity 
                                key={item.item_id}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, marginHorizontal: 16, backgroundColor: '#f9f9f9', borderRadius: 6, marginBottom: 4 }}
                                onPress={() => selectFromMenuRestaurant(item)}
                                data-testid={`select-menu-item-sections-${item.item_id}`}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontWeight: '500', color: '#333' }}>{item.name}</Text>
                                  {item.descriptions && item.descriptions[0] && (
                                    <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>{item.descriptions[0]}</Text>
                                  )}
                                </View>
                                <Text style={{ color: primaryColor, fontSize: 20 }}>+</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })}
                    
                    {/* Option pour ajouter manuellement */}
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, marginHorizontal: 16, marginTop: 8, marginBottom: 20, backgroundColor: '#e8f5e9', borderRadius: 8 }}
                      onPress={() => { setShowMenuSelector(false); setMenuSelectorSearchQuery(''); loadPreparations(); setShowAddProduct(true); }}
                      data-testid="add-manual-product-btn"
                    >
                      <Text style={{ color: '#2e7d32', fontSize: 20, marginRight: 8 }}>✏️</Text>
                      <Text style={{ color: '#2e7d32', fontWeight: '600' }}>Ajouter manuellement</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        )}
        
        {/* Modal Ajouter/Modifier Produit - rendu via fonction partagée */}
        {renderAddProductModal()}
      </SafeAreaWrapper>
    );
  }
  
  // Vue des Produits (d'une section)
  if (currentView === 'products') {
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="fiche-products-screen" addBottomPadding={true}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity onPress={() => { setCurrentView('sections'); setSelectedSection(null); }} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor, flex: 1 }}>{selectedSection?.name}</Text>
          </View>
          
          {/* Toggle Avec/Sans photos */}
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: showPhotos ? primaryColor : '#e0e0e0',
                borderTopLeftRadius: 8,
                borderBottomLeftRadius: 8,
                alignItems: 'center'
              }}
              onPress={() => setShowPhotos(true)}
            >
              <Text style={{ color: showPhotos ? secondaryColor : '#333', fontWeight: showPhotos ? 'bold' : 'normal', fontSize: 13 }}>
                📷 Avec photos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 8,
                backgroundColor: !showPhotos ? primaryColor : '#e0e0e0',
                borderTopRightRadius: 8,
                borderBottomRightRadius: 8,
                alignItems: 'center'
              }}
              onPress={() => setShowPhotos(false)}
            >
              <Text style={{ color: !showPhotos ? secondaryColor : '#333', fontWeight: !showPhotos ? 'bold' : 'normal', fontSize: 13 }}>
                📋 Sans photos
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Liste des produits */}
          <ScrollView style={{ flex: 1 }}>
            {sectionProducts.map((product: any) => (
              <TouchableOpacity
                key={product.product_id}
                style={{
                  backgroundColor: primaryColor,
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
                onPress={() => { setSelectedProduct(product); setCurrentView('productDetail'); }}
                data-testid={`product-${product.product_id}`}
              >
                {/* Photo miniature */}
                {showPhotos && product.photo_base64 && (
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); setFullScreenPhoto(product.photo_base64); }}
                    style={{ marginRight: 12 }}
                  >
                    <img 
                      src={product.photo_base64} 
                      alt={product.name}
                      style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }}
                    />
                  </TouchableOpacity>
                )}
                {showPhotos && !product.photo_base64 && (
                  <View style={{ 
                    width: 50, 
                    height: 50, 
                    borderRadius: 6, 
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12
                  }}>
                    <Text style={{ color: secondaryColor, opacity: 0.5, fontSize: 20 }}>📷</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: secondaryColor }}>{product.name}</Text>
                  {/* Prix de revient et de vente - uniquement pour Manager */}
                  {isManager && (
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                      <Text style={{ fontSize: 14, color: secondaryColor, opacity: 0.8 }}>
                        Revient: {product.total_cost?.toFixed(2) || '0.00'}€
                      </Text>
                      {product.selling_price && (
                        <Text style={{ fontSize: 14, color: '#4CAF50', fontWeight: 'bold' }}>
                          Vente: {product.selling_price.toFixed(2)}€
                        </Text>
                      )}
                    </View>
                  )}
                  {/* Staff voit juste le nombre d'ingrédients */}
                  {!isManager && (
                    <Text style={{ fontSize: 14, color: secondaryColor, opacity: 0.7, marginTop: 4 }}>
                      {product.ingredients?.length || 0} ingrédient{(product.ingredients?.length || 0) > 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
                {/* Boutons d'édition - uniquement pour Manager */}
                {isManager && (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); openEditProduct(product); }}
                      style={{ padding: 8, backgroundColor: secondaryColor, borderRadius: 4 }}
                    >
                      <Text style={{ color: primaryColor }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); handleArchiveProduct(product.product_id); }}
                      style={{ padding: 8, backgroundColor: '#607D8B', borderRadius: 4 }}
                      data-testid={`archive-product-${product.product_id}`}
                    >
                      <Text style={{ color: '#fff', fontSize: 12 }}>Arch.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); handleDeleteProduct(product.product_id); }}
                      style={{ padding: 8, backgroundColor: '#ff4444', borderRadius: 4 }}
                    >
                      <Text style={{ color: '#fff' }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            
            {sectionProducts.length === 0 && (
              <Text style={{ textAlign: 'center', color: primaryColor, marginTop: 20, opacity: 0.7 }}>
                Aucun produit dans cette section.
              </Text>
            )}
          </ScrollView>
          
          {/* Bouton Ajouter produit - uniquement pour Manager */}
          {isManager && (
            <TouchableOpacity
              style={{
                backgroundColor: '#4CAF50',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 12
              }}
              onPress={() => { resetProductForm(); loadMenuSelectorData(); setShowMenuSelector(true); }}
              data-testid="add-product-btn"
            >
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>+ Ajouter un produit</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Modal Sélecteur Menu Restaurant (Carte Food/Boisson) */}
        {showMenuSelector && (
          <Modal visible={true} transparent animationType="slide">
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              {/* Overlay - ne couvre que la partie haute, ne bloque pas les clics sur le contenu */}
              <Pressable 
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
                onPress={() => { setShowMenuSelector(false); setMenuSelectorSearchQuery(''); }}
              />
              {/* Contenu du modal - au-dessus de l'overlay */}
              <View 
                style={{ backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', position: 'relative' }}
                // @ts-ignore - stop propagation on web
                onClick={(e: any) => e.stopPropagation()}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor }}>
                    {selectedCategory === 'bar' ? '🍸 Sélectionner depuis Carte Boisson' : '🍽️ Sélectionner depuis Carte Food'}
                  </Text>
                  <TouchableOpacity onPress={() => { setShowMenuSelector(false); setMenuSelectorSearchQuery(''); }}>
                    <Text style={{ fontSize: 24, color: '#666' }}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Barre de recherche */}
                <View style={{ padding: 16, paddingTop: 12 }}>
                  <TextInput 
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, backgroundColor: '#f9f9f9' }} 
                    placeholder={selectedCategory === 'bar' ? "Rechercher une boisson..." : "Rechercher un plat..."} 
                    value={menuSelectorSearchQuery} 
                    onChangeText={setMenuSelectorSearchQuery}
                  />
                </View>
                
                {isLoadingMenuSelector ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: '#666' }}>Chargement...</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 400 }}>
                    {menuSelectorSections
                      .filter((s: any) => !s.parent_section_id)
                      .map((section: any) => {
                        const sectionItems = menuSelectorItems.filter((i: any) => {
                          const matchesSection = i.section_id === section.section_id || 
                            menuSelectorSections.some((sub: any) => sub.parent_section_id === section.section_id && sub.section_id === i.section_id);
                          const matchesSearch = !menuSelectorSearchQuery || 
                            i.name.toLowerCase().includes(menuSelectorSearchQuery.toLowerCase());
                          return matchesSection && matchesSearch;
                        });
                        
                        if (sectionItems.length === 0) return null;
                        
                        return (
                          <View key={section.section_id} style={{ marginBottom: 8 }}>
                            <View style={{ backgroundColor: section.color || primaryColor, padding: 10, marginHorizontal: 16, borderRadius: 6, marginBottom: 4 }}>
                              <Text style={{ color: '#fff', fontWeight: '600' }}>{section.name}</Text>
                            </View>
                            {sectionItems.map((item: any) => (
                              <TouchableOpacity 
                                key={item.item_id}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, marginHorizontal: 16, backgroundColor: '#f9f9f9', borderRadius: 6, marginBottom: 4 }}
                                onPress={() => selectFromMenuRestaurant(item)}
                                data-testid={`select-menu-item-sections-${item.item_id}`}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontWeight: '500', color: '#333' }}>{item.name}</Text>
                                  {item.descriptions && item.descriptions[0] && (
                                    <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>{item.descriptions[0]}</Text>
                                  )}
                                </View>
                                <Text style={{ color: primaryColor, fontSize: 20 }}>+</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })}
                    
                    {/* Option pour ajouter manuellement */}
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, marginHorizontal: 16, marginTop: 8, marginBottom: 20, backgroundColor: '#e8f5e9', borderRadius: 8 }}
                      onPress={() => { setShowMenuSelector(false); setMenuSelectorSearchQuery(''); loadPreparations(); setShowAddProduct(true); }}
                      data-testid="add-manual-product-btn"
                    >
                      <Text style={{ color: '#2e7d32', fontSize: 20, marginRight: 8 }}>✏️</Text>
                      <Text style={{ color: '#2e7d32', fontWeight: '600' }}>Ajouter manuellement</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        )}
        
        
        {/* Modal Ajouter/Modifier Produit - rendu via fonction partagée */}
        {renderAddProductModal()}
      </SafeAreaWrapper>
    );
  }
  
  // Vue détail d'un produit
  if (currentView === 'productDetail' && selectedProduct) {
    const ingredients = selectedProduct.ingredients || [];
    
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="product-detail-screen" addBottomPadding={true}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => { 
              // Trouver la section du produit pour la vue products
              const productSection = sections.find((s: any) => s.section_id === selectedProduct.section_id);
              if (productSection) setSelectedSection(productSection);
              setCurrentView('products'); 
              setSelectedProduct(null); 
            }} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor, flex: 1 }}>{selectedProduct.name}</Text>
            {/* Bouton d'édition - pour Manager OU staff avec permissions */}
            {canEditProduct && (
              <TouchableOpacity
                onPress={() => openEditProduct(selectedProduct)}
                style={{ padding: 8, backgroundColor: primaryColor, borderRadius: 4 }}
                data-testid="edit-product-btn"
              >
                <Text style={{ color: secondaryColor }}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <ScrollView style={{ flex: 1 }}>
            {/* Tableau des ingrédients */}
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 12 }}>
              Ingrédients ({ingredients.length})
            </Text>
            
            {ingredients.length > 0 ? (
              <View style={{ backgroundColor: '#f9f9f9', borderRadius: 8, overflow: 'hidden' }}>
                {/* Header du tableau - colonnes prix pour ceux qui peuvent voir les marges */}
                <View style={{ flexDirection: 'row', backgroundColor: primaryColor, padding: 12 }}>
                  <Text style={{ flex: 2, color: secondaryColor, fontWeight: 'bold' }}>Ingrédient</Text>
                  <Text style={{ flex: 1, color: secondaryColor, fontWeight: 'bold', textAlign: 'center' }}>Utilisé</Text>
                  {/* Colonnes prix - pour Manager OU staff avec permission analyse marges */}
                  {canAnalyzeMargins && (
                    <>
                      <Text style={{ flex: 1, color: secondaryColor, fontWeight: 'bold', textAlign: 'center' }}>Acheté</Text>
                      <Text style={{ flex: 1, color: secondaryColor, fontWeight: 'bold', textAlign: 'right' }}>Prix</Text>
                      <Text style={{ flex: 1, color: secondaryColor, fontWeight: 'bold', textAlign: 'right' }}>Coût</Text>
                    </>
                  )}
                </View>
                
                {/* Lignes */}
                {ingredients.map((ing: any, index: number) => (
                  <View key={index} style={{ flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                    <Text style={{ flex: 2, color: primaryColor }}>{ing.name}</Text>
                    <Text style={{ flex: 1, color: primaryColor, textAlign: 'center' }}>{ing.quantity_used} {ing.unit_used}</Text>
                    {/* Détails prix - pour Manager OU staff avec permission analyse marges */}
                    {canAnalyzeMargins && (
                      <>
                        <Text style={{ flex: 1, color: primaryColor, textAlign: 'center' }}>{ing.quantity_purchased} {ing.unit_purchased}</Text>
                        <Text style={{ flex: 1, color: primaryColor, textAlign: 'right' }}>{ing.purchase_price?.toFixed(2)}€</Text>
                        <Text style={{ flex: 1, color: '#4CAF50', fontWeight: 'bold', textAlign: 'right' }}>{ing.cost?.toFixed(2)}€</Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ textAlign: 'center', color: primaryColor, opacity: 0.7, marginVertical: 20 }}>
                Aucun ingrédient ajouté
              </Text>
            )}
            
            {/* Récapitulatif - pour Manager OU staff avec permission analyse marges */}
            {canAnalyzeMargins && (
              <View style={{ backgroundColor: primaryColor, borderRadius: 8, padding: 16, marginTop: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, color: secondaryColor }}>Prix de revient :</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: secondaryColor }}>{selectedProduct.total_cost?.toFixed(2) || '0.00'} €</Text>
                </View>
                
                {selectedProduct.multiplier && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, color: secondaryColor }}>Multiplicateur :</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: secondaryColor }}>× {selectedProduct.multiplier}</Text>
                  </View>
                )}
                
                {selectedProduct.selling_price && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: secondaryColor, paddingTop: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: secondaryColor }}>Prix de vente :</Text>
                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#4CAF50' }}>{selectedProduct.selling_price.toFixed(2)} €</Text>
                  </View>
                )}
              </View>
            )}
            
            {/* Notes / Instructions */}
            {selectedProduct.notes && (
              <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 16, marginTop: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#e65100', marginBottom: 8 }}>
                  📝 Notes / Instructions
                </Text>
                <Text style={{ color: '#333', lineHeight: 22 }}>
                  {selectedProduct.notes}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
        
        {/* Modal Modifier Produit */}
        {showEditProduct && (
          <Modal visible={true} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
              <ScrollView style={{ maxHeight: '90%' }}>
                <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>
                    Modifier le produit
                  </Text>
                  
                  {/* Nom du produit */}
                  <Text style={{ color: primaryColor, marginBottom: 4 }}>Nom du produit</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: primaryColor,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      color: primaryColor
                    }}
                    value={newProductName}
                    onChangeText={setNewProductName}
                  />
                  
                  {/* Multiplicateur */}
                  <Text style={{ color: primaryColor, marginBottom: 4 }}>Multiplicateur</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: primaryColor,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      color: primaryColor
                    }}
                    value={newProductMultiplier}
                    onChangeText={setNewProductMultiplier}
                    keyboardType="decimal-pad"
                  />
                  
                  {/* Ingrédients */}
                  <Text style={{ color: primaryColor, marginBottom: 8, fontWeight: 'bold' }}>Ingrédients</Text>
                  
                  {newProductIngredients.map((ing: any, index: number) => (
                    <View key={index} style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold', color: primaryColor }}>Ingrédient {index + 1}</Text>
                        <TouchableOpacity onPress={() => removeIngredient(index)}>
                          <Text style={{ color: '#ff4444' }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      
                      <TextInput
                        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 8 }}
                        placeholder="Nom"
                        value={ing.name}
                        onChangeText={(v) => updateIngredient(index, 'name', v)}
                      />
                      
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <TextInput
                          style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
                          placeholder="Qté utilisée"
                          keyboardType="decimal-pad"
                          value={ing.quantity_used?.toString()}
                          onChangeText={(v) => {
                            const normalized = v.replace(',', '.');
                            updateIngredient(index, 'quantity_used', normalized);
                          }}
                        />
                        <View style={{ width: 80, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, flexDirection: 'row', alignItems: 'center' }}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {units.map(u => (
                              <TouchableOpacity
                                key={u}
                                onPress={() => updateIngredient(index, 'unit_used', u)}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 10,
                                  backgroundColor: ing.unit_used === u ? primaryColor : 'transparent',
                                  borderRadius: 4
                                }}
                              >
                                <Text style={{ fontSize: 12, color: ing.unit_used === u ? secondaryColor : '#333' }}>{u}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                      
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <TextInput
                          style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
                          placeholder="Qté achetée"
                          keyboardType="decimal-pad"
                          value={ing.quantity_purchased?.toString()}
                          onChangeText={(v) => {
                            const normalized = v.replace(',', '.');
                            updateIngredient(index, 'quantity_purchased', normalized);
                          }}
                        />
                        <View style={{ width: 80, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, flexDirection: 'row', alignItems: 'center' }}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {units.map(u => (
                              <TouchableOpacity
                                key={u}
                                onPress={() => updateIngredient(index, 'unit_purchased', u)}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 10,
                                  backgroundColor: ing.unit_purchased === u ? primaryColor : 'transparent',
                                  borderRadius: 4
                                }}
                              >
                                <Text style={{ fontSize: 12, color: ing.unit_purchased === u ? secondaryColor : '#333' }}>{u}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                      
                      <TextInput
                        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
                        placeholder="Prix d'achat (€)"
                        keyboardType="decimal-pad"
                        value={ing.purchase_price?.toString()}
                        onChangeText={(v) => {
                          const normalized = v.replace(',', '.');
                          updateIngredient(index, 'purchase_price', normalized);
                        }}
                      />
                    </View>
                  ))}
                  
                  <TouchableOpacity
                    style={{ backgroundColor: primaryColor, padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 }}
                    onPress={addIngredient}
                  >
                    <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>+ Ajouter un ingrédient</Text>
                  </TouchableOpacity>
                  
                  {/* Champ Notes / Instructions */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontWeight: 'bold', color: primaryColor, marginBottom: 8 }}>Notes / Instructions (optionnel)</Text>
                    <TextInput
                      style={{ 
                        borderWidth: 1, 
                        borderColor: '#ccc', 
                        borderRadius: 8, 
                        padding: 12, 
                        minHeight: 100,
                        textAlignVertical: 'top'
                      }}
                      placeholder="Ex: Mélanger 4cl de rhum, ajouter décoration, servir frais..."
                      value={newProductNotes}
                      onChangeText={setNewProductNotes}
                      multiline
                      numberOfLines={4}
                      data-testid="edit-product-notes-input"
                    />
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#ccc', padding: 12, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setShowEditProduct(false)}
                    >
                      <Text style={{ fontWeight: 'bold' }}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, alignItems: 'center' }}
                      onPress={handleUpdateProduct}
                      disabled={isLoading}
                    >
                      <Text style={{ fontWeight: 'bold', color: '#fff' }}>{isLoading ? '...' : 'Modifier'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </Modal>
        )}
      </SafeAreaWrapper>
    );
  }
  
  // Vue Export
  if (currentView === 'export') {
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="fiche-export-screen" addBottomPadding={true}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setCurrentView('main')} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>Exporter les fiches</Text>
          </View>
          
          <Text style={{ color: primaryColor, marginBottom: 8 }}>
            Sélectionnez les produits à exporter ({selectedForExport.length} sélectionné{selectedForExport.length > 1 ? 's' : ''})
          </Text>
          
          {/* Option Avec/Sans prix - EN HAUT */}
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: '#f0f0f0', 
            borderRadius: 8, 
            padding: 4,
            marginBottom: 8
          }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: exportWithPrices ? primaryColor : 'transparent',
                padding: 10,
                borderRadius: 6,
                alignItems: 'center'
              }}
              onPress={() => setExportWithPrices(true)}
              data-testid="export-with-prices-btn"
            >
              <Text style={{ 
                fontWeight: 'bold', 
                color: exportWithPrices ? secondaryColor : primaryColor,
                fontSize: 14
              }}>
                Avec prix
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: !exportWithPrices ? primaryColor : 'transparent',
                padding: 10,
                borderRadius: 6,
                alignItems: 'center'
              }}
              onPress={() => setExportWithPrices(false)}
              data-testid="export-without-prices-btn"
            >
              <Text style={{ 
                fontWeight: 'bold', 
                color: !exportWithPrices ? secondaryColor : primaryColor,
                fontSize: 14
              }}>
                Sans prix
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Filtre Bar / Cuisine côte à côte */}
          <View 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#f0f0f0', 
              borderRadius: 8, 
              padding: 4,
              marginBottom: 16
            }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: exportCategoryFilter === 'bar' ? '#3498db' : 'transparent',
                padding: 12,
                borderRadius: 6,
                alignItems: 'center'
              }}
              onPress={() => {
                console.log('Bar pressed');
                setExportCategoryFilter('bar');
                setSelectedForExport([]);
              }}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ 
                fontWeight: 'bold', 
                color: exportCategoryFilter === 'bar' ? '#fff' : primaryColor,
                fontSize: 14
              }}>
                Bar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: exportCategoryFilter === 'cuisine' ? '#e67e22' : 'transparent',
                padding: 12,
                borderRadius: 6,
                alignItems: 'center'
              }}
              onPress={() => {
                console.log('Cuisine pressed');
                setExportCategoryFilter('cuisine');
                setSelectedForExport([]);
              }}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ 
                fontWeight: 'bold', 
                color: exportCategoryFilter === 'cuisine' ? '#fff' : primaryColor,
                fontSize: 14
              }}>
                Cuisine
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Boutons Tout sélectionner / Tout désélectionner - APRÈS le filtre Bar/Cuisine */}
          {(exportCategoryFilter === 'bar' || exportCategoryFilter === 'cuisine') && (
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <Pressable
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: pressed ? '#388e3c' : '#4caf50',
                  padding: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  minHeight: 48
                })}
                onPress={() => {
                  console.log('[SelectAll] Button clicked');
                  console.log('[SelectAll] exportCategoryFilter:', exportCategoryFilter);
                  console.log('[SelectAll] sections count:', sections?.length);
                  console.log('[SelectAll] products count:', products?.length);
                  
                  // Filtrer les produits selon la catégorie de leur section
                  const categorySectionIds = sections
                    .filter((s: any) => s.category === exportCategoryFilter)
                    .map((s: any) => s.section_id);
                  console.log('[SelectAll] Sections with category:', categorySectionIds);
                  
                  const visibleProducts = products.filter((p: any) => 
                    categorySectionIds.includes(p.section_id)
                  );
                  console.log('[SelectAll] Visible products:', visibleProducts.length);
                  
                  const newSelection = visibleProducts.map((p: any) => p.product_id);
                  console.log('[SelectAll] New selection IDs:', newSelection);
                  
                  // Force update with functional callback
                  setSelectedForExport(() => [...newSelection]);
                  console.log('[SelectAll] setSelectedForExport called');
                }}
              >
                <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 14 }}>
                  ✓ Tout sélectionner
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: pressed ? '#d32f2f' : '#f44336',
                  padding: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 48
                })}
                onPress={() => {
                  console.log('[DeselectAll] Button clicked');
                  setSelectedForExport(() => []);
                  console.log('[DeselectAll] setSelectedForExport([]) called');
                }}
              >
                <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 14 }}>
                  ✕ Tout désélectionner
                </Text>
              </Pressable>
            </View>
          )}
          
          <ScrollView style={{ flex: 1 }}>
            {/* Bar - affiché uniquement si filtre = bar */}
            {exportCategoryFilter === 'bar' && barSections.length > 0 && (
              <>
                {barSections.map((section: any) => {
                  const secProducts = products.filter((p: any) => p.section_id === section.section_id);
                  return (
                    <View key={section.section_id} style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#3498db', marginBottom: 8, marginLeft: 8 }}>{section.name}</Text>
                      {secProducts.map((product: any) => (
                        <TouchableOpacity
                          key={product.product_id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: selectedForExport.includes(product.product_id) ? '#3498db' : '#f5f5f5',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 4
                          }}
                          onPress={() => toggleExportSelection(product.product_id)}
                        >
                          <Text style={{
                            flex: 1,
                            color: selectedForExport.includes(product.product_id) ? '#fff' : primaryColor
                          }}>
                            {product.name}
                          </Text>
                          <Text style={{
                            color: selectedForExport.includes(product.product_id) ? '#fff' : '#666'
                          }}>
                            {selectedForExport.includes(product.product_id) ? '✓' : '○'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
            
            {/* Cuisine - affiché uniquement si filtre = cuisine */}
            {exportCategoryFilter === 'cuisine' && cuisineSections.length > 0 && (
              <>
                {cuisineSections.map((section: any) => {
                  const secProducts = products.filter((p: any) => p.section_id === section.section_id);
                  return (
                    <View key={section.section_id} style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#e67e22', marginBottom: 8, marginLeft: 8 }}>{section.name}</Text>
                      {secProducts.map((product: any) => (
                        <TouchableOpacity
                          key={product.product_id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: selectedForExport.includes(product.product_id) ? '#e67e22' : '#f5f5f5',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 4
                          }}
                          onPress={() => toggleExportSelection(product.product_id)}
                        >
                          <Text style={{
                            flex: 1,
                            color: selectedForExport.includes(product.product_id) ? '#fff' : primaryColor
                          }}>
                            {product.name}
                          </Text>
                          <Text style={{
                            color: selectedForExport.includes(product.product_id) ? '#fff' : '#666'
                          }}>
                            {selectedForExport.includes(product.product_id) ? '✓' : '○'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
            
            {/* Message si aucun filtre sélectionné */}
            {exportCategoryFilter === 'all' && (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <Text style={{ fontSize: 16, color: primaryColor, textAlign: 'center' }}>
                  Sélectionnez "Bar" ou "Cuisine" ci-dessus
                </Text>
              </View>
            )}
          </ScrollView>
          
          {/* Boutons Export */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: selectedForExport.length > 0 ? '#e74c3c' : '#ccc',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center'
              }}
              onPress={handleExportPDF}
              disabled={selectedForExport.length === 0}
              data-testid="export-pdf-btn"
            >
              <Text style={{ fontWeight: 'bold', color: '#fff' }}>📄 PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: selectedForExport.length > 0 ? '#27ae60' : '#ccc',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center'
              }}
              onPress={handleExportExcel}
              disabled={selectedForExport.length === 0}
              data-testid="export-excel-btn"
            >
              <Text style={{ fontWeight: 'bold', color: '#fff' }}>📊 Excel</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Modal: Envoyer vers Menu Restaurant */}
        <Modal visible={showSendToMenuModal} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20, width: '90%', maxWidth: 400 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 8 }}>
                Envoyer vers {menuTargetType === 'food' ? 'Carte Food' : 'Carte Boisson'}
              </Text>
              <Text style={{ color: '#666', marginBottom: 16 }}>
                Produit: {productForMenu?.name}
              </Text>
              
              <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Sélectionnez une section:</Text>
              
              {menuRestaurantSections.length === 0 ? (
                <Text style={{ color: '#999', fontStyle: 'italic', marginBottom: 16 }}>
                  Aucune section disponible. Créez d'abord une section dans Menu Restaurant.
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
                  {menuRestaurantSections.map((section: any) => (
                    <TouchableOpacity
                      key={section.section_id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 8,
                        backgroundColor: selectedMenuSection === section.section_id ? (menuTargetType === 'food' ? '#2C5F2D' : '#1B4965') : '#f0f0f0'
                      }}
                      onPress={() => setSelectedMenuSection(section.section_id)}
                    >
                      <Text style={{ 
                        color: selectedMenuSection === section.section_id ? '#fff' : '#333',
                        fontWeight: selectedMenuSection === section.section_id ? 'bold' : 'normal'
                      }}>
                        {section.parent_section_id ? '  └ ' : ''}{section.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#ccc', alignItems: 'center' }}
                  onPress={() => setShowSendToMenuModal(false)}
                >
                  <Text style={{ fontWeight: 'bold' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ 
                    flex: 1, 
                    padding: 14, 
                    borderRadius: 8, 
                    backgroundColor: selectedMenuSection ? (menuTargetType === 'food' ? '#2C5F2D' : '#1B4965') : '#ccc', 
                    alignItems: 'center' 
                  }}
                  onPress={handleSendToMenu}
                  disabled={!selectedMenuSection || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ fontWeight: 'bold', color: '#fff' }}>Envoyer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaWrapper>
    );
  }
  
  // Vue Analyse des Marges
  if (currentView === 'marginAnalysis') {
    const filteredProducts = getFilteredAndSortedProducts();
    const stats = marginAnalysisData?.statistics || { total: 0, faible: 0, moyen: 0, bon: 0, undefined: 0 };
    
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="fiche-margin-analysis-screen" addBottomPadding={true}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setCurrentView('main')} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: primaryColor }}>📊 Analyse des Marges</Text>
          </View>
          
          {isLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={primaryColor} />
              <Text style={{ color: primaryColor, marginTop: 12 }}>Chargement...</Text>
            </View>
          ) : marginAnalysisData ? (
            <>
              {/* Statistiques globales */}
              <View style={{ 
                backgroundColor: primaryColor, 
                borderRadius: 12, 
                padding: 16, 
                marginBottom: 16 
              }}>
                <Text style={{ color: secondaryColor, fontWeight: 'bold', marginBottom: 12 }}>
                  Résumé ({stats.total} produits analysés)
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#e74c3c' }}>{stats.faible}</Text>
                    <Text style={{ color: secondaryColor, fontSize: 12 }}>🔴 Faible</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#f39c12' }}>{stats.moyen}</Text>
                    <Text style={{ color: secondaryColor, fontSize: 12 }}>🟡 Moyen</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#27ae60' }}>{stats.bon}</Text>
                    <Text style={{ color: secondaryColor, fontSize: 12 }}>🟢 Bon</Text>
                  </View>
                  {stats.undefined > 0 && (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#95a5a6' }}>{stats.undefined}</Text>
                      <Text style={{ color: secondaryColor, fontSize: 12 }}>⚪ Non défini</Text>
                    </View>
                  )}
                </View>
              </View>
              
              {/* Filtres et Tri */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8 }}>Filtrer par marge</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { key: 'all', label: 'Tous', color: primaryColor },
                      { key: 'faible', label: '🔴 Faible', color: '#e74c3c' },
                      { key: 'moyen', label: '🟡 Moyen', color: '#f39c12' },
                      { key: 'bon', label: '🟢 Bon', color: '#27ae60' },
                      { key: 'undefined', label: '⚪ Non défini', color: '#95a5a6' }
                    ].map(filter => (
                      <TouchableOpacity
                        key={filter.key}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: marginFilterCategory === filter.key ? filter.color : '#e0e0e0'
                        }}
                        onPress={() => setMarginFilterCategory(filter.key as any)}
                      >
                        <Text style={{ 
                          color: marginFilterCategory === filter.key ? '#fff' : '#333',
                          fontWeight: marginFilterCategory === filter.key ? 'bold' : 'normal'
                        }}>
                          {filter.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8 }}>Trier par</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { key: 'margin', label: 'Marge ↑' },
                    { key: 'name', label: 'Nom A-Z' },
                    { key: 'category', label: 'Catégorie' }
                  ].map(sort => (
                    <TouchableOpacity
                      key={sort.key}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: marginSortBy === sort.key ? primaryColor : '#e0e0e0'
                      }}
                      onPress={() => setMarginSortBy(sort.key as any)}
                    >
                      <Text style={{ 
                        color: marginSortBy === sort.key ? secondaryColor : '#333',
                        fontWeight: marginSortBy === sort.key ? 'bold' : 'normal'
                      }}>
                        {sort.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Liste des produits */}
              <ScrollView style={{ flex: 1 }}>
                {filteredProducts.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: primaryColor, marginTop: 40, opacity: 0.7 }}>
                    Aucun produit correspondant aux critères
                  </Text>
                ) : (
                  filteredProducts.map((product: any) => (
                    <View
                      key={product.product_id}
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 12,
                        borderLeftWidth: 5,
                        borderLeftColor: getMarginColor(product.margin_category),
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        elevation: 3
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor }}>
                            {product.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                            {product.section_name} • {product.category === 'bar' ? '🍸 Bar' : '🍽️ Cuisine'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <View style={{ 
                            backgroundColor: getMarginColor(product.margin_category),
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 16
                          }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                              {product.margin_percent !== null ? `${product.margin_percent}%` : 'N/A'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                            {getMarginEmoji(product.margin_category)} {product.margin_category === 'undefined' ? 'Non défini' : product.margin_category.charAt(0).toUpperCase() + product.margin_category.slice(1)}
                          </Text>
                        </View>
                      </View>
                      
                      {/* Détails coût/prix */}
                      {product.product_type !== 'boisson_multi' && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
                          <View>
                            <Text style={{ fontSize: 11, color: '#666' }}>Coût de revient</Text>
                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#e74c3c' }}>
                              {product.total_cost?.toFixed(2) || '0.00'}€
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 11, color: '#666' }}>Prix de vente</Text>
                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#27ae60' }}>
                              {product.selling_price?.toFixed(2) || 'Non défini'}€
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {/* Détails pour boisson multi */}
                      {product.product_type === 'boisson_multi' && product.formats_detail && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
                          <Text style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Détail par format:</Text>
                          {product.formats_detail.map((fmt: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: '#333' }}>{fmt.format_name}</Text>
                              <View style={{ flexDirection: 'row', gap: 12 }}>
                                <Text style={{ fontSize: 12, color: '#666' }}>Coût: {fmt.cost.toFixed(2)}€</Text>
                                <Text style={{ fontSize: 12, color: '#666' }}>Vente: {fmt.selling_price.toFixed(2)}€</Text>
                                <Text style={{ 
                                  fontSize: 12, 
                                  fontWeight: 'bold',
                                  color: fmt.margin_percent < 20 ? '#e74c3c' : fmt.margin_percent >= 50 ? '#27ae60' : '#f39c12'
                                }}>
                                  {fmt.margin_percent.toFixed(1)}%
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
              
              {/* Bouton configuration des seuils */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#607D8B',
                  padding: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 12
                }}
                onPress={() => {
                  // Ouvrir un modal pour choisir la section à configurer
                  showAlert(
                    'Configurer les seuils',
                    'Sélectionnez une section pour configurer ses seuils de marge',
                    [
                      ...(marginAnalysisData?.sections || []).map((sec: any) => ({
                        text: `${sec.category === 'bar' ? '🍸' : '🍽️'} ${sec.section_name}`,
                        onPress: () => openThresholdModal(sec)
                      })),
                      { text: 'Annuler', style: 'cancel' }
                    ]
                  );
                }}
                data-testid="configure-thresholds-btn"
              >
                <Text style={{ fontWeight: 'bold', color: '#fff' }}>⚙️ Configurer les seuils par section</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ textAlign: 'center', color: primaryColor, marginTop: 40 }}>
              Aucune donnée disponible
            </Text>
          )}
        </View>
        
        {/* Modal Configuration des Seuils */}
        {showThresholdModal && editingThresholdSection && (
          <Modal visible={true} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
              <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 8 }}>
                  Seuils de marge
                </Text>
                <Text style={{ color: primaryColor, opacity: 0.7, marginBottom: 16 }}>
                  {editingThresholdSection.category === 'bar' ? '🍸' : '🍽️'} {editingThresholdSection.section_name}
                </Text>
                
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: primaryColor, marginBottom: 4 }}>🔴 Seuil "Faible" (en dessous = rouge)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#e74c3c',
                        borderRadius: 8,
                        padding: 12,
                        color: primaryColor
                      }}
                      placeholder="Ex: 20"
                      keyboardType="decimal-pad"
                      value={thresholdLow}
                      onChangeText={setThresholdLow}
                      data-testid="threshold-low-input"
                    />
                    <Text style={{ marginLeft: 8, color: primaryColor, fontWeight: 'bold' }}>%</Text>
                  </View>
                </View>
                
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: primaryColor, marginBottom: 4 }}>🟢 Seuil "Bon" (au-dessus = vert)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#27ae60',
                        borderRadius: 8,
                        padding: 12,
                        color: primaryColor
                      }}
                      placeholder="Ex: 50"
                      keyboardType="decimal-pad"
                      value={thresholdHigh}
                      onChangeText={setThresholdHigh}
                      data-testid="threshold-high-input"
                    />
                    <Text style={{ marginLeft: 8, color: primaryColor, fontWeight: 'bold' }}>%</Text>
                  </View>
                </View>
                
                <Text style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 16 }}>
                  Entre {thresholdLow || '?'}% et {thresholdHigh || '?'}% = 🟡 Moyen (jaune)
                </Text>
                
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#ccc', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => { setShowThresholdModal(false); setEditingThresholdSection(null); }}
                  >
                    <Text style={{ fontWeight: 'bold' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#9C27B0', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={handleUpdateThresholds}
                    disabled={isLoading}
                    data-testid="save-thresholds-btn"
                  >
                    <Text style={{ fontWeight: 'bold', color: '#fff' }}>{isLoading ? '...' : 'Enregistrer'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        
        {/* Modal Photo Plein Écran */}
        {fullScreenPhoto && (
          <Modal visible={true} transparent animationType="fade">
            <TouchableOpacity 
              style={{ 
                flex: 1, 
                backgroundColor: 'rgba(0,0,0,0.95)', 
                justifyContent: 'center', 
                alignItems: 'center' 
              }}
              onPress={() => setFullScreenPhoto(null)}
              activeOpacity={1}
            >
              <TouchableOpacity 
                style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}
                onPress={() => setFullScreenPhoto(null)}
              >
                <Text style={{ color: '#fff', fontSize: 30 }}>✕</Text>
              </TouchableOpacity>
              <img 
                src={fullScreenPhoto} 
                alt="Photo plein écran"
                style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: 8 }}
              />
            </TouchableOpacity>
          </Modal>
        )}
      </SafeAreaWrapper>
    );
  }
  
  // Vue Archivage - Liste des produits archivés
  if (currentView === 'archived') {
    return (
      <SafeAreaWrapper backgroundColor={secondaryColor} style={{ flex: 1 }} data-testid="fiche-archived-screen" addBottomPadding={true}>
        <View style={{ flex: 1, padding: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setCurrentView('main')} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 24, color: primaryColor }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: primaryColor }}>Archivage</Text>
          </View>
          
          {/* Description */}
          <View style={{ backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <Text style={{ color: '#666', fontSize: 14 }}>
              Les fiches techniques archivées sont conservées ici. Vous pouvez les restaurer ou les supprimer définitivement.
            </Text>
          </View>
          
          {isLoadingArchived ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={primaryColor} />
              <Text style={{ color: primaryColor, marginTop: 12 }}>Chargement...</Text>
            </View>
          ) : archivedProducts.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📭</Text>
              <Text style={{ fontSize: 18, color: primaryColor, textAlign: 'center' }}>
                Aucune fiche technique archivée
              </Text>
              <Text style={{ fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' }}>
                Les produits archivés apparaîtront ici
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              {archivedProducts.map((product: any) => (
                <View
                  key={product.product_id}
                  style={{
                    backgroundColor: '#fff',
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 12,
                    borderLeftWidth: 4,
                    borderLeftColor: '#607D8B',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 2
                  }}
                >
                  {/* Info produit */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>
                      {product.name}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <View style={{ backgroundColor: product.section_category === 'bar' ? '#E3F2FD' : '#FFF3E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 12, color: product.section_category === 'bar' ? '#1976D2' : '#F57C00' }}>
                          {product.section_category === 'bar' ? '🍸 Bar' : '🍽️ Cuisine'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 12, color: '#666' }}>{product.section_name}</Text>
                      </View>
                    </View>
                    {product.notes && (
                      <Text style={{ fontSize: 13, color: '#666', marginTop: 8, fontStyle: 'italic' }}>
                        📝 {product.notes.substring(0, 100)}{product.notes.length > 100 ? '...' : ''}
                      </Text>
                    )}
                  </View>
                  
                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#4CAF50',
                        padding: 12,
                        borderRadius: 8,
                        alignItems: 'center'
                      }}
                      onPress={() => handleRestoreProduct(product.product_id)}
                      disabled={isLoading}
                      data-testid={`restore-product-${product.product_id}`}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Restaurer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#f44336',
                        padding: 12,
                        borderRadius: 8,
                        alignItems: 'center'
                      }}
                      onPress={() => handlePermanentDelete(product.product_id)}
                      disabled={isLoading}
                      data-testid={`delete-permanent-${product.product_id}`}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaWrapper>
    );
  }
  
  return null;
}

// ==================== MENU RESTAURANT SCREEN ====================
// Design avec couleurs distinctives et bonne visibilité
// Palette de couleurs contrastées pour les différents niveaux
const MENU_COLORS = {
  // Sections principales - RAL 5008 (Grey Blue / Bleu gris)
  sectionFood: '#37474F',        // RAL 5008 - Bleu gris foncé pour sections Food
  sectionBoisson: '#37474F',     // RAL 5008 - Bleu gris foncé pour sections Boisson
  // Sous-sections (moyennes)
  subSection: '#5B5EA6',       // Violet/Indigo
  // Items
  itemName: '#1A1A2E',         // Noir profond
  itemDesc: '#8B4513',         // Marron (SaddleBrown) - pour différencier des noms de plats
  itemPrice: '#D4AF37',        // Or/Doré
  // Suggestions/Succession
  suggestion: '#C84B31',       // Rouge brique
  // Happy Hour
  happyHour: '#FF6B35',        // Orange vif
  // Suppléments
  supplement: '#6B4226',       // Marron foncé
  // Notes
  note: '#8B0000',             // Rouge foncé
};

function MenuRestaurantScreen({ sections, items, notes, ficheProducts, primaryColor, secondaryColor, apiRequest, loadSections, loadItems, loadNotes, loadFicheProducts, setCurrentScreen, sessionToken, isDraftMode = false, userPermissions = {}, isAdmin = false }: any) {
  // API prefix based on mode (draft or main)
  const apiPrefix = isDraftMode ? '/menu-restaurant-draft' : '/menu-restaurant';
  
  // Permission helpers - Admin has full access, staff uses userPermissions
  const canAddSection = isAdmin || userPermissions?.section?.ajouter;
  const canEditSection = isAdmin || userPermissions?.section?.modifier;
  const canDeleteSection = isAdmin || userPermissions?.section?.supprimer;
  const canAddProduct = isAdmin || userPermissions?.produits?.ajouter;
  const canEditProduct = isAdmin || userPermissions?.produits?.modifier;
  const canDeleteProduct = isAdmin || userPermissions?.produits?.supprimer;
  const canExportPdf = isAdmin || userPermissions?.export_pdf;
  const canExportCsv = isAdmin || userPermissions?.export_csv;
  const canImportCsv = isAdmin || userPermissions?.import_csv;
  const canImportPdf = isAdmin || userPermissions?.import_pdf;
  const canAddNote = isAdmin || userPermissions?.note;
  
  const [currentTab, setCurrentTab] = useState<'food' | 'boisson'>('food');
  const [showTabDropdown, setShowTabDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // PDF Preview state
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewType, setPdfPreviewType] = useState<'food' | 'boisson'>('food');
  
  // Section form state
  const [showAddSection, setShowAddSection] = useState(false);
  const [showEditSection, setShowEditSection] = useState(false);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionParentId, setNewSectionParentId] = useState<string | null>(null);
  const [newSectionHasHappyHour, setNewSectionHasHappyHour] = useState(false);
  const [newSectionOrder, setNewSectionOrder] = useState('');
  
  // Choice modal for adding item or subsection
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [addChoiceSection, setAddChoiceSection] = useState<any>(null);
  
  // Item form state
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescriptions, setNewItemDescriptions] = useState<string[]>(['']);
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemHappyHourPrice, setNewItemHappyHourPrice] = useState('');
  const [newItemHappyHourDiscount, setNewItemHappyHourDiscount] = useState('');
  const [newItemHappyHourDiscountType, setNewItemHappyHourDiscountType] = useState<'percent' | 'euro'>('percent');
  const [newItemTvaRate, setNewItemTvaRate] = useState<'10' | '20'>('10');
  const [newItemFormats, setNewItemFormats] = useState<any[]>([]);
  const [newItemSuggestions, setNewItemSuggestions] = useState<any[]>([]);
  const [newItemSupplements, setNewItemSupplements] = useState<any[]>([]);
  const [newItemOptions, setNewItemOptions] = useState<any[]>([]);
  const [newItemOrder, setNewItemOrder] = useState('');
  const [newItemAllergens, setNewItemAllergens] = useState<string[]>([]);
  const [newItemTags, setNewItemTags] = useState<string[]>([]);
  const [newItemStatus, setNewItemStatus] = useState<string>('normal');
  // États pour la coloration Excel
  const [newItemExcelStatus, setNewItemExcelStatus] = useState<string>('normal');
  const [newItemModifiedFields, setNewItemModifiedFields] = useState<string[]>([]);
  // États pour intégration Zelty et cuisson
  const [newItemZeltyId, setNewItemZeltyId] = useState('');
  const [newItemCookingOptions, setNewItemCookingOptions] = useState<string[]>([]);
  const [newItemRequiresCooking, setNewItemRequiresCooking] = useState(false);
  
  // Options de cuisson prédéfinies
  const COOKING_OPTIONS_PRESETS = [
    'Bleu', 'Saignant', 'À point', 'Bien cuit'
  ];
  
  // Liste des 14 allergènes officiels
  const ALLERGENS_LIST = [
    { id: 'gluten', label: '🌾 Gluten & Céréales' },
    { id: 'crustaces', label: '🦐 Crustacés' },
    { id: 'oeufs', label: '🥚 Œufs' },
    { id: 'poissons', label: '🐟 Poissons' },
    { id: 'arachides', label: '🥜 Arachides' },
    { id: 'soja', label: '🌱 Soja' },
    { id: 'lactose', label: '🥛 Lactose' },
    { id: 'fruits_coque', label: '🌰 Fruits à coque' },
    { id: 'celeri', label: '🌿 Céleri' },
    { id: 'moutarde', label: '🌭 Moutarde' },
    { id: 'sesame', label: '🥖 Sésame' },
    { id: 'sulfites', label: '🍷 Sulfites' },
    { id: 'lupin', label: '🌼 Lupin' },
    { id: 'mollusques', label: '🐚 Mollusques' },
  ];
  
  // Liste des 3 tags
  const TAGS_LIST = [
    { id: 'vegetarien', label: '🥬 Végétarien' },
    { id: 'vegan', label: '🥦 Végan' },
    { id: 'epice', label: '🌶️ Épicé' },
  ];
  
  // Liste des statuts avec couleurs
  const STATUS_LIST = [
    { id: 'normal', label: 'Normal', color: 'transparent', borderColor: '#ccc' },
    { id: 'a_ajouter', label: '✓ À ajouter', color: '#28a745', borderColor: '#28a745' },
    { id: 'a_modifier', label: '✏️ En modification', color: '#9b59b6', borderColor: '#9b59b6' },
    { id: 'a_supprimer', label: '✗ À supprimer', color: '#dc3545', borderColor: '#dc3545' },
  ];
  
  // Note form state
  const [showAddNote, setShowAddNote] = useState(false);
  const [showEditNote, setShowEditNote] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  
  // ========== A L'ARDOISE STATE ==========
  const [ardoiseData, setArdoiseData] = useState<any>(null);
  const [showArdoiseModal, setShowArdoiseModal] = useState(false);
  const [ardoiseShareLink, setArdoiseShareLink] = useState('');
  const [editingArdoise, setEditingArdoise] = useState<any>(null);
  
  // Load ardoise data
  const loadArdoise = async () => {
    try {
      console.log('Loading ardoise data...');
      const data = await apiRequest('/ardoise');
      console.log('Ardoise data loaded:', data);
      setArdoiseData(data);
    } catch (error) {
      console.error('Error loading ardoise:', error);
    }
  };
  
  // Save ardoise data
  const saveArdoise = async () => {
    if (!editingArdoise) return;
    try {
      await apiRequest('/ardoise', {
        method: 'PUT',
        body: JSON.stringify(editingArdoise)
      });
      setArdoiseData(editingArdoise);
      setShowArdoiseModal(false);
      showAlert('Succès', 'Ardoise mise à jour');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Get share link
  const getArdoiseShareLink = async () => {
    try {
      const data = await apiRequest('/ardoise/share-link');
      setArdoiseShareLink(data.share_url);
      if (Platform.OS === 'web') {
        window.prompt('Lien permanent de partage (copiez-le):', data.share_url);
      } else {
        showAlert('Lien de partage', data.share_url);
      }
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Export ardoise PDF (utilise la fonction universelle PWA)
  const handleExportArdoisePDF = async () => {
    try {
      const pdfUrl = `${API_URL}/ardoise/export-pdf`;
      const filename = `ardoise_${new Date().toISOString().split('T')[0]}.pdf`;
      const success = await downloadOrShareFile(pdfUrl, filename, 'application/pdf', sessionToken || undefined);
      if (!success) {
        showAlert('Erreur', 'Impossible de télécharger le PDF');
      }
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Export ardoise pour réseaux sociaux (utilise la fonction universelle PWA)
  const handleExportArdoiseSocial = async (format: 'instagram_story' | 'instagram_post' | 'facebook') => {
    try {
      if (!ardoiseData?.share_token) {
        showAlert('Erreur', 'Aucun token de partage disponible');
        return;
      }
      const imageUrl = `${API_URL}/ardoise/export-social/${ardoiseData.share_token}?format=${format}`;
      const filename = `menu_social_${format}_${new Date().toISOString().split('T')[0]}.png`;
      const success = await downloadOrShareFile(imageUrl, filename, 'image/png', sessionToken || undefined);
      if (success) {
        showAlert('Succès', `Image ${format} téléchargée !`);
      } else {
        showAlert('Erreur', 'Impossible de générer l\'image');
      }
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // State pour le menu d'export social
  const [showSocialExportMenu, setShowSocialExportMenu] = useState(false);
  
  // Open edit ardoise modal
  const openArdoiseEditor = () => {
    if (ardoiseData) {
      setEditingArdoise({
        entree: ardoiseData.entree || [{ name: '', description: '', price: null }, { name: '', description: '', price: null }],
        plat: ardoiseData.plat || [{ name: '', description: '', price: null }, { name: '', description: '', price: null }],
        dessert: ardoiseData.dessert || [{ name: '', description: '', price: null }, { name: '', description: '', price: null }]
      });
      setShowArdoiseModal(true);
    }
  };
  
  // Update ardoise item
  const updateArdoiseItem = (section: 'entree' | 'plat' | 'dessert', index: number, field: string, value: any) => {
    if (!editingArdoise) return;
    const updated = { ...editingArdoise };
    updated[section][index][field] = value;
    setEditingArdoise(updated);
  };
  
  // Load ardoise on mount
  React.useEffect(() => {
    const fetchArdoiseData = async () => {
      if (!sessionToken) return;
      try {
        const response = await fetch(`${API_URL}/ardoise`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setArdoiseData(data);
        }
      } catch (error) {
        console.error('Ardoise fetch error:', error);
      }
    };
    fetchArdoiseData();
  }, []);
  
  // Filter sections and items by current tab
  const tabSections = sections.filter((s: any) => s.menu_type === currentTab);
  const tabItems = items.filter((i: any) => {
    const section = sections.find((s: any) => s.section_id === i.section_id);
    return section && section.menu_type === currentTab;
  });
  const tabNotes = notes.filter((n: any) => n.menu_type === currentTab);
  
  // Get parent sections (for sub-section dropdown)
  const parentSections = tabSections.filter((s: any) => !s.parent_section_id);
  
  // Group sections hierarchically
  const getSectionHierarchy = () => {
    // Exclure la section "A L'ARDOISE" car elle est affichée séparément dans le composant Ardoise noir
    const topLevelSections = tabSections.filter((s: any) => 
      !s.parent_section_id && 
      !s.name.toLowerCase().includes("ardoise")
    );
    return topLevelSections.map((parent: any) => ({
      ...parent,
      subSections: tabSections.filter((s: any) => s.parent_section_id === parent.section_id)
    }));
  };
  
  // Get items for a specific section
  const getSectionItems = (sectionId: string) => {
    let sectionItems = tabItems.filter((i: any) => i.section_id === sectionId);
    
    // Appliquer le filtre allergène si des allergènes sont exclus
    if (excludedAllergens.length > 0) {
      sectionItems = sectionItems.filter((item: any) => {
        const itemAllergens = item.allergens || [];
        // Exclure l'item si l'un de ses allergènes est dans la liste d'exclusion
        return !itemAllergens.some((allergen: string) => excludedAllergens.includes(allergen));
      });
    }
    
    return sectionItems;
  };
  
  // Reset form states
  const resetSectionForm = () => {
    setNewSectionName('');
    setNewSectionParentId(null);
    setNewSectionHasHappyHour(false);
    setNewSectionOrder('');
    setSelectedSection(null);
  };
  
  const resetItemForm = () => {
    setNewItemName('');
    setNewItemDescriptions(['']);
    setNewItemPrice('');
    setNewItemHappyHourPrice('');
    setNewItemHappyHourDiscount('');
    setNewItemHappyHourDiscountType('percent');
    setNewItemTvaRate('10');
    setNewItemFormats([]);
    setNewItemSuggestions([]);
    setNewItemSupplements([]);
    setNewItemOptions([]);
    setNewItemOrder('');
    setNewItemAllergens([]);
    setNewItemTags([]);
    setNewItemStatus('normal');
    setNewItemModifiedFields([]);
    setNewItemZeltyId('');
    setNewItemCookingOptions([]);
    setNewItemRequiresCooking(false);
    setSelectedItem(null);
    setEditingItem(null);
  };
  
  // Calculer le prix Happy Hour à partir de la remise
  const calculateHappyHourPrice = () => {
    const price = parseFloat(newItemPrice.replace(',', '.')) || 0;
    const discount = parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0;
    if (!price || !discount) return;
    
    let hhPrice;
    if (newItemHappyHourDiscountType === 'percent') {
      hhPrice = price * (1 - discount / 100);
    } else {
      hhPrice = price - discount;
    }
    setNewItemHappyHourPrice(Math.max(0, hhPrice).toFixed(2).replace('.', ','));
  };
  
  // Calculer le prix HT à partir du TTC
  const calculatePriceHT = (priceTTC: number, tvaRate: number) => {
    return priceTTC / (1 + tvaRate / 100);
  };
  
  const resetNoteForm = () => {
    setNewNoteContent('');
    setSelectedNote(null);
  };
  
  // Create section
  const handleCreateSection = async () => {
    if (!newSectionName.trim()) { showAlert('Erreur', 'Veuillez entrer un nom'); return; }
    setIsLoading(true);
    try {
      await apiRequest(`${apiPrefix}/sections/create`, {
        method: 'POST',
        body: JSON.stringify({
          menu_type: currentTab,
          name: newSectionName.trim(),
          parent_section_id: newSectionParentId,
          has_happy_hour: newSectionHasHappyHour,
          order: newSectionOrder ? parseInt(newSectionOrder) : null
        })
      });
      await loadSections();
      setShowAddSection(false);
      resetSectionForm();
      showAlert('Succès', 'Section créée');
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  // Update section
  const handleUpdateSection = async () => {
    if (!selectedSection || !newSectionName.trim()) return;
    setIsLoading(true);
    try {
      await apiRequest(`/menu-restaurant/sections/${selectedSection.section_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: newSectionName.trim(),
          has_happy_hour: newSectionHasHappyHour,
          order: newSectionOrder ? parseInt(newSectionOrder) : null
        })
      });
      await loadSections();
      setShowEditSection(false);
      resetSectionForm();
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  // Delete section - using window.confirm for web compatibility
  const handleDeleteSection = async (sectionId: string) => {
    const confirmed = await showConfirm('Supprimer cette section et tous ses items ?');
    if (!confirmed) return;
    
    try {
      await apiRequest(`${apiPrefix}/sections/${sectionId}`, { method: 'DELETE' });
      await loadSections();
      await loadItems();
    } catch (error: any) { 
      alert('Erreur: ' + error.message); 
    }
  };
  
  // Helper to convert string price to number
  const parsePrice = (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const strValue = String(value).replace(',', '.');
    const num = parseFloat(strValue);
    return isNaN(num) ? null : num;
  };

  // Create item
  const handleCreateItem = async () => {
    if (!newItemName.trim() || !selectedSection) { showAlert('Erreur', 'Veuillez remplir les champs requis'); return; }
    setIsLoading(true);
    try {
      // Convert all string prices to numbers at submission time
      const formatsWithPrices = newItemFormats.map(fmt => ({
        name: fmt.name,
        price: parsePrice(fmt.price) || 0,
        happy_hour_price: parsePrice(fmt.happy_hour_price)
      }));
      const suggestionsWithPrices = newItemSuggestions.map(sug => ({
        name: sug.name,
        price: parsePrice(sug.price) || 0
      }));
      const supplementsWithPrices = newItemSupplements.map(sup => ({
        name: sup.name,
        price: parsePrice(sup.price) || 0
      }));
      const optionsWithPrices = newItemOptions.filter(opt => opt.name.trim()).map(opt => ({
        name: opt.name.trim(),
        price: parsePrice(opt.price) || 0
      }));
      
      await apiRequest(`${apiPrefix}/items/create`, {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedSection.section_id,
          name: newItemName.trim(),
          descriptions: newItemDescriptions.filter(d => d.trim()),
          price: parsePrice(newItemPrice),
          happy_hour_price: parsePrice(newItemHappyHourPrice),
          tva_rate: parseFloat(newItemTvaRate),
          formats: formatsWithPrices,
          suggestions: suggestionsWithPrices,
          supplements: supplementsWithPrices,
          options: optionsWithPrices,
          order: newItemOrder ? parseInt(newItemOrder) : null,
          allergens: newItemAllergens,
          tags: newItemTags,
          excel_status: 'added',  // Nouveaux items sont automatiquement marqués "ajouté" (vert)
          modified_fields: ['name', 'price', 'description']  // Tous les champs en vert
        })
      });
      await loadItems();
      setShowAddItem(false);
      resetItemForm();
      showAlert('Succès', 'Item ajouté');
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  // Update item
  const handleUpdateItem = async () => {
    if (!editingItem || !newItemName.trim()) return;
    setIsLoading(true);
    try {
      // Convert all string prices to numbers at submission time
      const formatsWithPrices = newItemFormats.map(fmt => ({
        name: fmt.name,
        price: parsePrice(fmt.price) || 0,
        happy_hour_price: parsePrice(fmt.happy_hour_price)
      }));
      const suggestionsWithPrices = newItemSuggestions.map(sug => ({
        name: sug.name,
        price: parsePrice(sug.price) || 0
      }));
      const supplementsWithPrices = newItemSupplements.map(sup => ({
        name: sup.name,
        price: parsePrice(sup.price) || 0
      }));
      const optionsWithPrices = newItemOptions.filter(opt => opt.name.trim()).map(opt => ({
        name: opt.name.trim(),
        price: parsePrice(opt.price) || 0
      }));
      
      // Déterminer le statut Excel basé sur newItemStatus (UI)
      let finalExcelStatus = 'normal';
      let finalModifiedFields: string[] = [];
      
      // Mapper le statut UI vers le statut Excel
      if (newItemStatus === 'a_ajouter') {
        finalExcelStatus = 'added';
        finalModifiedFields = ['name', 'price', 'description']; // Tous les champs en vert
      } else if (newItemStatus === 'a_supprimer') {
        finalExcelStatus = 'deleted';
        finalModifiedFields = ['name', 'price', 'description']; // Tous les champs en rouge
      } else if (newItemStatus === 'a_modifier') {
        finalExcelStatus = 'modified';
        finalModifiedFields = newItemModifiedFields; // Seuls les champs sélectionnés en violet
      } else {
        finalExcelStatus = 'normal';
        finalModifiedFields = [];
      }
      
      await apiRequest(`${apiPrefix}/items/${editingItem.item_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: newItemName.trim(),
          descriptions: newItemDescriptions.filter(d => d.trim()),
          price: parsePrice(newItemPrice),
          happy_hour_price: parsePrice(newItemHappyHourPrice),
          tva_rate: parseFloat(newItemTvaRate),
          formats: formatsWithPrices,
          suggestions: suggestionsWithPrices,
          supplements: supplementsWithPrices,
          options: optionsWithPrices,
          order: newItemOrder ? parseInt(newItemOrder) : null,
          allergens: newItemAllergens,
          tags: newItemTags,
          status: newItemStatus,
          excel_status: finalExcelStatus,
          modified_fields: finalModifiedFields,
          zelty_id: newItemZeltyId.trim() || null,
          cooking_options: newItemCookingOptions.length > 0 ? newItemCookingOptions : null,
          requires_cooking_choice: newItemRequiresCooking
        })
      });
      await loadItems();
      setShowEditItem(false);
      resetItemForm();
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  // Delete item - Actually delete the item
  const handleDeleteItem = async (itemId: string) => {
    const confirmed = await showConfirm('Supprimer définitivement cet item ?');
    if (!confirmed) return;
    
    try {
      await apiRequest(`${apiPrefix}/items/${itemId}`, { 
        method: 'DELETE'
      });
      await loadItems();
    } catch (error: any) { 
      alert('Erreur: ' + error.message); 
    }
  };
  
  // Create note
  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) { showAlert('Erreur', 'Veuillez entrer une note'); return; }
    setIsLoading(true);
    try {
      await apiRequest(`${apiPrefix}/notes/create`, {
        method: 'POST',
        body: JSON.stringify({
          menu_type: currentTab,
          content: newNoteContent.trim()
        })
      });
      await loadNotes();
      setShowAddNote(false);
      resetNoteForm();
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  // Delete note - using window.confirm for web compatibility
  const handleDeleteNote = async (noteId: string) => {
    const confirmed = await showConfirm('Supprimer cette note ?');
    if (!confirmed) return;
    
    try {
      await apiRequest(`${apiPrefix}/notes/${noteId}`, { method: 'DELETE' });
      await loadNotes();
    } catch (error: any) { 
      alert('Erreur: ' + error.message); 
    }
  };
  
  // Open edit section modal
  const openEditSection = (section: any) => {
    setSelectedSection(section);
    setNewSectionName(section.name);
    setNewSectionHasHappyHour(section.has_happy_hour || false);
    setNewSectionOrder(section.order != null ? String(section.order) : '');
    setShowEditSection(true);
  };
  
  // Open choice modal for adding item or subsection
  const openAddChoice = (section: any) => {
    setAddChoiceSection(section);
    setShowAddChoice(true);
  };
  
  // Handle choice: add subsection
  const handleAddSubsection = () => {
    setShowAddChoice(false);
    resetSectionForm();
    setNewSectionParentId(addChoiceSection.section_id);
    setShowAddSection(true);
  };
  
  // Handle choice: add item
  const handleAddItemChoice = () => {
    setShowAddChoice(false);
    setSelectedSection(addChoiceSection);
    resetItemForm();
    setShowAddItem(true);
  };
  
  // Open add item modal directly
  const openAddItem = (section: any) => {
    setSelectedSection(section);
    resetItemForm();
    setShowAddItem(true);
  };
  
  // Open edit item modal
  const openEditItem = (item: any) => {
    setEditingItem(item);
    setNewItemName(item.name);
    setNewItemDescriptions(item.descriptions?.length > 0 ? item.descriptions : ['']);
    setNewItemPrice(item.price ? String(item.price) : '');
    setNewItemHappyHourPrice(item.happy_hour_price ? String(item.happy_hour_price) : '');
    setNewItemHappyHourDiscount('');
    setNewItemHappyHourDiscountType('percent');
    setNewItemTvaRate(item.tva_rate ? String(item.tva_rate) as '10' | '20' : '10');
    setNewItemOrder(item.order != null ? String(item.order) : '');
    // Convert numeric prices to strings for editing
    setNewItemFormats(item.formats?.map((f: any) => ({
      name: f.name || '',
      price: f.price != null ? String(f.price) : '',
      happy_hour_price: f.happy_hour_price != null ? String(f.happy_hour_price) : '',
      hh_discount: f.hh_discount || '',
      hh_discount_type: f.hh_discount_type || 'percent'
    })) || []);
    setNewItemSuggestions(item.suggestions?.map((s: any) => ({
      name: s.name || '',
      price: s.price != null ? String(s.price) : ''
    })) || []);
    setNewItemSupplements(item.supplements?.map((s: any) => ({
      name: s.name || '',
      price: s.price != null ? String(s.price) : ''
    })) || []);
    // Load options
    setNewItemOptions(item.options?.map((o: any) => ({
      name: o.name || '',
      price: o.price != null ? String(o.price) : ''
    })) || []);
    // Load allergens, tags
    setNewItemAllergens(item.allergens || []);
    setNewItemTags(item.tags || []);
    
    // Charger le statut UI à partir du statut existant ou excel_status
    // Priorité: item.status (UI) > conversion depuis excel_status
    let statusToSet = item.status || 'normal';
    if (item.excel_status === 'added') statusToSet = 'a_ajouter';
    else if (item.excel_status === 'deleted') statusToSet = 'a_supprimer';
    else if (item.excel_status === 'modified') statusToSet = 'a_modifier';
    setNewItemStatus(statusToSet);
    
    // Charger les champs modifiés existants
    setNewItemModifiedFields(item.modified_fields || []);
    
    // Charger Zelty ID et options de cuisson
    setNewItemZeltyId(item.zelty_id || '');
    setNewItemCookingOptions(item.cooking_options || []);
    setNewItemRequiresCooking(item.requires_cooking_choice || false);
    
    setShowEditItem(true);
  };
  
  // Add format for boisson multi-price
  const addFormat = () => {
    setNewItemFormats([...newItemFormats, { name: '', price: '', happy_hour_price: '', hh_discount: '', hh_discount_type: 'percent' }]);
  };
  
  // Update format (keep as string during input, convert on submit)
  const updateFormat = (index: number, field: string, value: string) => {
    const updated = [...newItemFormats];
    // Keep the raw string value during input
    updated[index] = { ...updated[index], [field]: value };
    
    // Si on efface la remise HH, effacer aussi le prix HH
    if (field === 'hh_discount' && (!value || value.trim() === '')) {
      updated[index].happy_hour_price = '';
    }
    
    setNewItemFormats(updated);
  };
  
  // Remove format
  const removeFormat = (index: number) => {
    setNewItemFormats(newItemFormats.filter((_, i) => i !== index));
  };
  
  // Add suggestion
  const addSuggestion = () => {
    setNewItemSuggestions([...newItemSuggestions, { name: '', price: '' }]);
  };
  
  // Update suggestion (keep as string during input)
  const updateSuggestion = (index: number, field: string, value: string) => {
    const updated = [...newItemSuggestions];
    updated[index] = { ...updated[index], [field]: value };
    setNewItemSuggestions(updated);
  };
  
  // Remove suggestion
  const removeSuggestion = (index: number) => {
    setNewItemSuggestions(newItemSuggestions.filter((_, i) => i !== index));
  };
  
  // Add supplement
  const addSupplement = () => {
    setNewItemSupplements([...newItemSupplements, { name: '', price: '' }]);
  };
  
  // Update supplement (keep as string during input)
  const updateSupplement = (index: number, field: string, value: string) => {
    const updated = [...newItemSupplements];
    updated[index] = { ...updated[index], [field]: value };
    setNewItemSupplements(updated);
  };
  
  // Remove supplement
  const removeSupplement = (index: number) => {
    setNewItemSupplements(newItemSupplements.filter((_, i) => i !== index));
  };
  
  // Add option (for food items like +2€ Jambon Serrano)
  const addOption = () => {
    setNewItemOptions([...newItemOptions, { name: '', price: '' }]);
  };
  
  // Update option (keep as string during input)
  const updateOption = (index: number, field: string, value: string) => {
    const updated = [...newItemOptions];
    updated[index] = { ...updated[index], [field]: value };
    setNewItemOptions(updated);
  };
  
  // Remove option
  const removeOption = (index: number) => {
    setNewItemOptions(newItemOptions.filter((_, i) => i !== index));
  };
  
  // Add description line
  const addDescription = () => {
    setNewItemDescriptions([...newItemDescriptions, '']);
  };
  
  // Update description
  const updateDescription = (index: number, value: string) => {
    const updated = [...newItemDescriptions];
    updated[index] = value;
    setNewItemDescriptions(updated);
  };
  
  // Remove description
  const removeDescription = (index: number) => {
    if (newItemDescriptions.length > 1) {
      setNewItemDescriptions(newItemDescriptions.filter((_, i) => i !== index));
    }
  };
  
  // Toggle allergen selection
  const toggleAllergen = (allergenId: string) => {
    if (newItemAllergens.includes(allergenId)) {
      setNewItemAllergens(newItemAllergens.filter(a => a !== allergenId));
    } else {
      setNewItemAllergens([...newItemAllergens, allergenId]);
    }
  };
  
  // Toggle tag selection
  const toggleTag = (tagId: string) => {
    if (newItemTags.includes(tagId)) {
      setNewItemTags(newItemTags.filter(t => t !== tagId));
    } else {
      setNewItemTags([...newItemTags, tagId]);
    }
  };
  
  // Render section header
  const renderSectionHeader = (section: any, isSubSection: boolean = false) => {
    const bgColor = isSubSection ? MENU_COLORS.subSection : (currentTab === 'food' ? MENU_COLORS.sectionFood : MENU_COLORS.sectionBoisson);
    
    // Calculer si on peut afficher les boutons d'action (au moins un bouton visible)
    const showActionButtons = canAddProduct || canEditSection || canDeleteSection;
    
    return (
      <View key={section.section_id} style={{ marginBottom: isSubSection ? 8 : 16 }}>
        <View style={[menuRestaurantStyles.sectionHeader, { backgroundColor: bgColor, marginLeft: isSubSection ? 16 : 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={menuRestaurantStyles.sectionTitle}>{section.name}</Text>
            {section.has_happy_hour && (
              <View style={[menuRestaurantStyles.happyHourBadge, { backgroundColor: MENU_COLORS.happyHour }]}>
                <Text style={menuRestaurantStyles.happyHourBadgeText}>Happy Hour</Text>
              </View>
            )}
          </View>
          {showActionButtons && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {/* Bouton Ajouter - visible si peut ajouter des produits */}
            {canAddProduct && (
            <TouchableOpacity 
              onPress={() => isSubSection ? openAddItem(section) : openAddChoice(section)} 
              style={[menuRestaurantStyles.sectionActionBtn, { minWidth: 36, justifyContent: 'center', alignItems: 'center' }]}
              data-testid={`add-item-${section.section_id}`}
            >
              <WebIcon name="add" size={16} color="white" />
            </TouchableOpacity>
            )}
            {/* Bouton Modifier - visible si peut modifier les sections */}
            {canEditSection && (
            <TouchableOpacity 
              onPress={() => openEditSection(section)} 
              style={[menuRestaurantStyles.sectionActionBtn, { minWidth: 36, justifyContent: 'center', alignItems: 'center' }]}
              data-testid={`edit-section-${section.section_id}`}
            >
              <WebIcon name="pencil" size={14} color="white" />
            </TouchableOpacity>
            )}
            {/* Bouton Supprimer - visible si peut supprimer les sections */}
            {canDeleteSection && (
            <TouchableOpacity 
              onPress={() => handleDeleteSection(section.section_id)} 
              style={[menuRestaurantStyles.sectionActionBtn, { backgroundColor: 'rgba(255,0,0,0.3)', minWidth: 36, justifyContent: 'center', alignItems: 'center' }]}
              data-testid={`delete-section-${section.section_id}`}
            >
              <WebIcon name="trash-outline" size={14} color="white" />
            </TouchableOpacity>
            )}
          </View>
          )}
        </View>
        
        {/* Items in this section */}
        {getSectionItems(section.section_id).map((item: any) => renderItem(item, section.has_happy_hour))}
        
        {/* Happy Hour Table - shown at bottom of section if has_happy_hour */}
        {section.has_happy_hour && renderHappyHourTable(section.section_id)}
      </View>
    );
  };
  
  // Render Happy Hour summary table for a section (sans prix barrés)
  const renderHappyHourTable = (sectionId: string) => {
    const sectionItems = getSectionItems(sectionId);
    const happyHourItems = sectionItems.filter((item: any) => 
      item.formats?.some((fmt: any) => fmt.happy_hour_price != null)
    );
    
    if (happyHourItems.length === 0) return null;
    
    return (
      <View style={menuRestaurantStyles.happyHourTable}>
        <View style={menuRestaurantStyles.happyHourTableHeader}>
          <WebIcon name="happy-outline" size={18} color="#fff" />
          <Text style={menuRestaurantStyles.happyHourTableTitle}>Happy Hour</Text>
        </View>
        <View style={menuRestaurantStyles.happyHourTableBody}>
          {happyHourItems.map((item: any) => (
            <View key={item.item_id}>
              {item.formats?.filter((fmt: any) => fmt.happy_hour_price != null).map((fmt: any, idx: number) => (
                <View key={idx} style={menuRestaurantStyles.happyHourTableRow}>
                  <Text style={menuRestaurantStyles.happyHourItemName}>
                    {item.name} {fmt.name ? `(${fmt.name})` : ''}
                  </Text>
                  <Text style={menuRestaurantStyles.happyHourNewPrice}>
                    {fmt.happy_hour_price.toFixed(2)}€
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  };
  
  // Move section up/down
  const handleMoveSection = async (sectionId: string, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`${API_URL}/menu-restaurant/sections/${sectionId}/move`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction })
      });
      if (response.ok) {
        fetchMenuRestaurantData();
      }
    } catch (error) {
      console.error('Error moving section:', error);
    }
  };
  
  // Move item up/down
  const handleMoveItem = async (itemId: string, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`${API_URL}/menu-restaurant/items/${itemId}/move`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction })
      });
      if (response.ok) {
        fetchMenuRestaurantData();
      }
    } catch (error) {
      console.error('Error moving item:', error);
    }
  };
  
  // Get status color for display
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'a_ajouter': return '#28a745';
      case 'a_modifier': return '#9b59b6';
      case 'a_supprimer': return '#dc3545';
      default: return 'transparent';
    }
  };
  
  // Render item
  const renderItem = (item: any, hasHappyHour: boolean = false) => {
    const statusColor = getStatusColor(item.status);
    const hasStatus = item.status && item.status !== 'normal';
    
    return (
      <View key={item.item_id} style={[
        menuRestaurantStyles.itemContainer,
        hasStatus && { borderLeftWidth: 4, borderLeftColor: statusColor }
      ]}>
        <View style={menuRestaurantStyles.itemRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={[menuRestaurantStyles.itemName, { color: MENU_COLORS.itemName }]}>{item.name}</Text>
              {/* Display tags inline with name */}
              {item.tags?.includes('vegetarien') && <Text style={{ fontSize: 12 }}>🥬</Text>}
              {item.tags?.includes('vegan') && <Text style={{ fontSize: 12 }}>🥦</Text>}
              {item.tags?.includes('epice') && <Text style={{ fontSize: 12 }}>🌶️</Text>}
            </View>
            {item.descriptions?.map((desc: string, idx: number) => (
              <Text key={idx} style={[menuRestaurantStyles.itemDesc, { color: MENU_COLORS.itemDesc }]}>{desc}</Text>
            ))}
            {/* Display allergens */}
            {item.allergens?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {item.allergens.map((allergId: string) => {
                  const allergen = ALLERGENS_LIST.find(a => a.id === allergId);
                  return allergen ? (
                    <Text key={allergId} style={{ fontSize: 11, color: '#e74c3c' }}>
                      {allergen.label.split(' ')[0]}
                    </Text>
                  ) : null;
                })}
              </View>
            )}
          </View>
          
          {/* Price display - without inline Happy Hour */}
          <View style={{ alignItems: 'flex-end', marginRight: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {item.price ? (
              <Text style={[menuRestaurantStyles.itemPrice, { color: MENU_COLORS.itemPrice }]}>{item.price.toFixed(2)}€</Text>
            ) : null}
            
            {/* Multi-format prices - Affichage vertical aligné (Petite 3.50€ / Grande 4.70€) */}
            {item.formats?.length > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                {item.formats.map((fmt: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx < item.formats.length - 1 ? 2 : 0 }}>
                    <Text style={{ fontSize: 12, color: '#666', marginRight: 8 }}>{fmt.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: MENU_COLORS.itemPrice, minWidth: 55, textAlign: 'right' }}>{fmt.price?.toFixed(2)}€</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          
          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {canEditProduct && (
            <TouchableOpacity 
              onPress={() => openEditItem(item)} 
              style={menuRestaurantStyles.itemActionBtn}
              data-testid={`edit-item-${item.item_id}`}
            >
              <WebIcon name="pencil" size={14} color="#666" />
            </TouchableOpacity>
            )}
            {canDeleteProduct && (
            <TouchableOpacity 
              onPress={() => handleDeleteItem(item.item_id)} 
              style={menuRestaurantStyles.itemActionBtn}
              data-testid={`delete-item-${item.item_id}`}
            >
              <WebIcon name="trash-outline" size={14} color="#C84B31" />
            </TouchableOpacity>
            )}
          </View>
        </View>
        
        {/* Suggestions */}
        {item.suggestions?.length > 0 && (
          <View style={menuRestaurantStyles.suggestionContainer}>
            {item.suggestions.map((sug: any, idx: number) => (
              <Text key={idx} style={[menuRestaurantStyles.suggestionText, { color: MENU_COLORS.suggestion }]}>
                Suggestion: {sug.name} +{sug.price.toFixed(2)}€
              </Text>
            ))}
          </View>
        )}
        
        {/* Supplements */}
        {item.supplements?.length > 0 && (
          <View style={menuRestaurantStyles.supplementContainer}>
            <Text style={[menuRestaurantStyles.supplementLabel, { color: MENU_COLORS.supplement }]}>Suppléments:</Text>
            {item.supplements.map((sup: any, idx: number) => (
              <Text key={idx} style={[menuRestaurantStyles.supplementText, { color: MENU_COLORS.supplement }]}>
                {sup.name} +{sup.price.toFixed(2)}€
              </Text>
            ))}
          </View>
        )}
        
        {/* Options payantes */}
        {item.options?.length > 0 && (
          <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e8e8e8' }}>
            <Text style={{ fontSize: 11, color: '#2e7d32', fontWeight: '600', marginBottom: 4 }}>Options:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.options.map((opt: any, idx: number) => (
                <View key={idx} style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 12, color: '#2e7d32' }}>
                    {opt.name} +{opt.price?.toFixed(2)}€
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };
  
  // Render note
  const renderNote = (note: any) => {
    return (
      <View key={note.note_id} style={[menuRestaurantStyles.noteContainer, { borderLeftColor: MENU_COLORS.note }]}>
        <Text style={[menuRestaurantStyles.noteText, { color: MENU_COLORS.note }]}>{note.content}</Text>
        <TouchableOpacity onPress={() => handleDeleteNote(note.note_id)} style={menuRestaurantStyles.noteDeleteBtn}>
          <WebIcon name="close-circle" size={20} color="#999" />
        </TouchableOpacity>
      </View>
    );
  };

  // Export functions
  const handlePreviewPDF = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/menu-restaurant/export-pdf/${currentTab}`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfPreviewType(currentTab);
      setShowPdfPreview(true);
    } catch (error: any) {
      showAlert('Erreur', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadFromPreview = () => {
    if (pdfPreviewUrl) {
      const link = document.createElement('a');
      link.href = pdfPreviewUrl;
      link.download = `carte_${pdfPreviewType}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showAlert('Succès', 'PDF téléchargé');
    }
  };

  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setShowPdfPreview(false);
  };

  const handleExportPDF = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/menu-restaurant/export-pdf/${currentTab}`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carte_${currentTab}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showAlert('Succès', 'PDF téléchargé');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsLoading(true);
      // Export CSV format (format lisible avec sections en en-têtes)
      const response = await fetch(`${API_URL}/menu-restaurant/export-csv/${currentTab}`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carte_${currentTab}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showAlert('Succès', 'CSV téléchargé avec sections, tags et allergènes');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Import CSV state
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportPdfModal, setShowImportPdfModal] = useState(false);
  const [importClearExisting, setImportClearExisting] = useState(false);
  const [importUpdateExisting, setImportUpdateExisting] = useState(true);
  const [importStats, setImportStats] = useState<any>(null);
  
  // Import PDF state for Menu Restaurant
  const [pdfExtractedItems, setPdfExtractedItems] = useState<any[]>([]);
  const [selectedPdfItems, setSelectedPdfItems] = useState<string[]>([]);
  const [isLoadingPdfImport, setIsLoadingPdfImport] = useState(false);
  
  // Filtre allergène
  const [showAllergenFilter, setShowAllergenFilter] = useState(false);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const allAllergens = ['gluten', 'crustaces', 'oeufs', 'poisson', 'arachides', 'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques'];
  const allergenLabels: {[key: string]: string} = {
    'gluten': '🌾 Gluten',
    'crustaces': '🦐 Crustacés',
    'oeufs': '🥚 Œufs',
    'poisson': '🐟 Poisson',
    'arachides': '🥜 Arachides',
    'soja': '🫘 Soja',
    'lait': '🥛 Lait',
    'fruits_a_coque': '🌰 Fruits à coque',
    'celeri': '🥬 Céleri',
    'moutarde': '🟡 Moutarde',
    'sesame': '⚪ Sésame',
    'sulfites': '🍷 Sulfites',
    'lupin': '🌼 Lupin',
    'mollusques': '🐚 Mollusques'
  };

  const handleImportCSV = async (fileContent: string) => {
    try {
      setIsLoading(true);
      
      // Debug: show first lines of the CSV
      const lines = fileContent.split('\n').slice(0, 5);
      console.log('[CSV IMPORT] First 5 lines:', lines);
      
      const response = await apiRequest(`${apiPrefix}/import-csv`, {
        method: 'POST',
        body: JSON.stringify({
          menu_type: currentTab,
          csv_content: fileContent,
          clear_existing: importClearExisting,
          update_existing: importUpdateExisting
        })
      });
      
      // Show debug info if no items were imported
      if (response.stats && response.stats.items_created === 0 && response.stats.items_updated === 0) {
        const debugHeaders = response.stats.debug_headers || [];
        console.log('[CSV IMPORT] Headers from backend:', debugHeaders);
        
        if (debugHeaders.length > 0 && !debugHeaders.some((h: string) => 
          ['Section', 'Produit', 'Product', 'Article', 'Catégorie'].includes(h)
        )) {
          showAlert(
            'Format non reconnu',
            `Les colonnes de votre fichier ne correspondent pas au format attendu.\n\nColonnes détectées: ${debugHeaders.slice(0, 5).join(', ')}\n\nColonnes attendues: Section, Sous-section, Produit, Description, Format, Prix`,
            [{ text: 'OK' }]
          );
          setIsLoading(false);
          return;
        }
      }
      
      setImportStats(response.stats);
      await loadSections(currentTab);
      await loadItems(currentTab);
      
      showAlert('Succès', response.message);
      setShowImportModal(false);
    } catch (error: any) {
      showAlert('Erreur', error.message || 'Import échoué');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    // Check if it's an Excel file
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      // Read Excel file and convert to CSV
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert entire sheet to array of arrays to analyze structure
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
          
          console.log('[EXCEL IMPORT] Raw data rows:', rawData.length);
          console.log('[EXCEL IMPORT] First 5 rows:', rawData.slice(0, 5));
          
          // Detect the format - is it the app's export format or standard CSV format?
          const firstRow = rawData[0] || [];
          const isAppExportFormat = firstRow[0]?.toString().includes('MENU') || 
                                     firstRow[0]?.toString().includes("O'Parloir") ||
                                     firstRow[0]?.toString().includes('Restaurant');
          
          if (isAppExportFormat) {
            // Parse the app's export Excel format
            console.log('[EXCEL IMPORT] Detected app export format - converting...');
            const csvContent = convertAppExcelToCSV(rawData);
            console.log('[EXCEL IMPORT] Converted CSV:', csvContent.substring(0, 500));
            handleImportCSV(csvContent);
          } else {
            // Standard format - convert to CSV with semicolon delimiter
            const csvContent = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
            console.log('[EXCEL IMPORT] Standard format CSV:', csvContent.substring(0, 500));
            handleImportCSV(csvContent);
          }
        } catch (error) {
          console.error('[EXCEL IMPORT] Error parsing Excel:', error);
          showAlert(
            'Erreur de lecture',
            'Impossible de lire le fichier Excel. Vérifiez que le fichier n\'est pas corrompu.',
            [{ text: 'OK' }]
          );
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Read CSV as text
      reader.onload = (e) => {
        const content = e.target?.result as string;
        handleImportCSV(content);
      };
      reader.readAsText(file, 'utf-8');
    }
  };
  
  // Convert the app's Excel export format to standard CSV
  const convertAppExcelToCSV = (rawData: any[][]): string => {
    const csvLines: string[] = [];
    csvLines.push('Section;Sous-section;Produit;Description;Format;Prix;Prix HH;Tags;Allergènes;Statut');
    
    let currentSection = '';
    let allergenColumns: string[] = [];
    let tagColumns: string[] = [];
    let headerRowIndex = -1;
    
    // Find the header structure
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const row = rawData[i];
      if (row && row.some((cell: any) => cell?.toString().includes('Description') || cell?.toString().includes('Prix'))) {
        headerRowIndex = i;
        break;
      }
    }
    
    // Parse the data
    for (let rowIndex = 0; rowIndex < rawData.length; rowIndex++) {
      const row = rawData[rowIndex];
      if (!row || row.length === 0) continue;
      
      const firstCell = row[0]?.toString().trim() || '';
      const secondCell = row[1]?.toString().trim() || '';
      
      // Skip title rows and empty rows
      if (rowIndex === 0 && (firstCell.includes('MENU') || firstCell.includes('Restaurant'))) {
        continue;
      }
      
      // Check if this is a section header (column A is uppercase and column B is "Description")
      if (firstCell && secondCell === 'Description') {
        currentSection = firstCell;
        
        // Next row might have allergen names
        if (rawData[rowIndex + 1]) {
          const allergenRow = rawData[rowIndex + 1];
          allergenColumns = [];
          tagColumns = [];
          for (let j = 8; j < allergenRow.length; j++) {
            const val = allergenRow[j]?.toString().trim();
            if (val && ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lactose', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'].includes(val)) {
              allergenColumns.push(val);
            } else if (val && ['Végétarien', 'Végan', 'Épicé'].includes(val)) {
              tagColumns.push(val);
            }
          }
        }
        continue;
      }
      
      // Skip rows that are allergen headers or empty
      if (!firstCell || firstCell === 'Gluten' || secondCell === 'Prix' || secondCell === 'Prix HH') {
        continue;
      }
      
      // This should be an item row
      const productName = firstCell;
      const description = row[1]?.toString().trim() || '';
      const prix = row[2]?.toString().replace('€', '').replace(',', '.').trim() || '';
      const prixHH = row[3]?.toString().replace('€', '').replace(',', '.').trim() || '';
      
      // Parse allergens from checkmarks
      const allergens: string[] = [];
      const tags: string[] = [];
      
      if (allergenColumns.length > 0) {
        for (let j = 8; j < row.length && j - 8 < allergenColumns.length; j++) {
          const val = row[j]?.toString().trim();
          if (val === '✓' || val === 'X' || val === 'x' || val === '1') {
            allergens.push(allergenColumns[j - 8].toLowerCase().replace('œufs', 'oeufs').replace('crustacés', 'crustaces').replace('céleri', 'celeri').replace('sésame', 'sesame').replace('fruits à coque', 'fruits_coque'));
          }
        }
      }
      
      // Create CSV line
      if (productName && currentSection) {
        const csvLine = [
          currentSection,
          '', // Sous-section
          productName,
          description,
          '', // Format
          prix,
          prixHH,
          tags.join(','),
          allergens.join(','),
          'normal' // Statut
        ].join(';');
        csvLines.push(csvLine);
      }
    }
    
    return csvLines.join('\n');
  };

  return (
    <View style={{ flex: 1, backgroundColor: secondaryColor, paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
      {/* Navigation rapide par sections - FIXE EN HAUT */}
      <View style={{ 
        backgroundColor: secondaryColor,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        zIndex: 100
      }}>
        {/* Header with back button - HIDDEN: le menu hamburger suffit pour la navigation */}
        {false && !isDraftMode && (
          <View style={menuRestaurantStyles.header}>
            <TouchableOpacity onPress={() => setCurrentScreen('menuRestaurant')} style={menuRestaurantStyles.backButton} data-testid="menu-restaurant-back">
              <WebIcon name="arrow-back" size={24} color={primaryColor} />
              <Text style={[menuRestaurantStyles.backText, { color: primaryColor }]}>Retour</Text>
            </TouchableOpacity>
            <Text style={[menuRestaurantStyles.screenTitle, { color: primaryColor }]}>Menu Restaurant</Text>
          </View>
        )}
        
        {/* Dropdown selector for Carte Food / Carte Boisson */}
        <View style={{ position: 'relative', zIndex: 100, marginBottom: 12 }}>
          <TouchableOpacity 
            style={[menuRestaurantStyles.dropdownButton, { 
              backgroundColor: currentTab === 'food' ? MENU_COLORS.sectionFood : MENU_COLORS.sectionBoisson 
            }]}
            onPress={() => setShowTabDropdown(!showTabDropdown)}
            data-testid="dropdown-carte-selector"
          >
            <Text style={menuRestaurantStyles.dropdownButtonText}>
              {currentTab === 'food' ? '🍽️ Carte Food' : '🍷 Carte Boisson'}
            </Text>
            <WebIcon name={showTabDropdown ? "chevron-up" : "chevron-down"} size={20} color="white" />
          </TouchableOpacity>
          
          {showTabDropdown && (
            <View style={menuRestaurantStyles.dropdownMenu}>
              <TouchableOpacity 
                style={[menuRestaurantStyles.dropdownItem, currentTab === 'food' && menuRestaurantStyles.dropdownItemActive]}
                onPress={() => { setCurrentTab('food'); setShowTabDropdown(false); }}
              >
                <Text style={menuRestaurantStyles.dropdownItemText}>🍽️ Carte Food</Text>
                {currentTab === 'food' && <WebIcon name="checkmark" size={18} color={MENU_COLORS.sectionFood} />}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[menuRestaurantStyles.dropdownItem, currentTab === 'boisson' && menuRestaurantStyles.dropdownItemActive]}
                onPress={() => { setCurrentTab('boisson'); setShowTabDropdown(false); }}
              >
                <Text style={menuRestaurantStyles.dropdownItemText}>🍷 Carte Boisson</Text>
                {currentTab === 'boisson' && <WebIcon name="checkmark" size={18} color={MENU_COLORS.sectionBoisson} />}
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        {/* Navigation rapide par sections */}
        {getSectionHierarchy().length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: '#666', fontSize: 12, marginBottom: 6, fontWeight: '600' }}>Navigation rapide :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
                {getSectionHierarchy().map((section: any) => (
                  <TouchableOpacity
                    key={`nav-${section.section_id}`}
                    style={{
                      backgroundColor: currentTab === 'food' ? MENU_COLORS.sectionFood : MENU_COLORS.sectionBoisson,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                    onPress={() => {
                      // Scroll vers la section - utiliser un ID unique
                      const sectionElement = document.getElementById(`section-${section.section_id}`);
                      if (sectionElement) {
                        sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    data-testid={`nav-section-${section.section_id}`}
                  >
                    <WebIcon name="arrow-forward-circle-outline" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>{section.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </View>
      
      {/* Contenu scrollable */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Les boutons d'action sont maintenant ici */}
        <View style={menuRestaurantStyles.actionRow}>
          {canAddSection && (
          <TouchableOpacity 
            style={[menuRestaurantStyles.addButton, { backgroundColor: currentTab === 'food' ? MENU_COLORS.sectionFood : MENU_COLORS.sectionBoisson }]}
            onPress={() => { resetSectionForm(); setNewSectionParentId(null); setShowAddSection(true); }}
            data-testid="add-section-btn"
          >
            <Text style={menuRestaurantStyles.addButtonText}>+ Section</Text>
          </TouchableOpacity>
          )}
          {/* Allergènes button only for Carte Food */}
          {currentTab === 'food' && (
            <TouchableOpacity 
              style={[menuRestaurantStyles.addButton, { backgroundColor: excludedAllergens.length > 0 ? '#f44336' : '#607d8b', paddingHorizontal: 10 }]}
              onPress={() => setShowAllergenFilter(true)}
              data-testid="allergen-filter-btn"
            >
              <Text style={[menuRestaurantStyles.addButtonText, { fontSize: 13 }]}>
                {excludedAllergens.length > 0 ? `Allergènes (${excludedAllergens.length})` : 'Allergènes'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[menuRestaurantStyles.addButton, { backgroundColor: MENU_COLORS.note }]}
            onPress={() => { resetNoteForm(); setShowAddNote(true); }}
            data-testid="add-note-btn"
          >
            <Text style={menuRestaurantStyles.addButtonText}>+ Note</Text>
          </TouchableOpacity>
        </View>
        
        {/* Export/Import buttons */}
        <View style={menuRestaurantStyles.exportRow}>
          <TouchableOpacity 
            style={[menuRestaurantStyles.exportButton, { backgroundColor: '#4A4A6A' }]}
            onPress={handleExportPDF}
            data-testid="export-pdf-btn"
          >
            <WebIcon name="download-outline" size={18} color="white" />
            <Text style={menuRestaurantStyles.exportButtonText}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[menuRestaurantStyles.exportButton, { backgroundColor: '#217346' }]}
            onPress={handleExportExcel}
            data-testid="export-csv-btn"
          >
            <WebIcon name="document-outline" size={18} color="white" />
            <Text style={menuRestaurantStyles.exportButtonText}>Export CSV</Text>
          </TouchableOpacity>
          {canImportCsv && (
          <TouchableOpacity 
            style={[menuRestaurantStyles.exportButton, { backgroundColor: '#FF9800' }]}
            onPress={() => setShowImportModal(true)}
            data-testid="import-csv-btn"
          >
            <WebIcon name="cloud-upload-outline" size={18} color="white" />
            <Text style={menuRestaurantStyles.exportButtonText}>Import CSV</Text>
          </TouchableOpacity>
          )}
          {canImportPdf && (
          <TouchableOpacity 
            style={[menuRestaurantStyles.exportButton, { backgroundColor: '#9C27B0' }]}
            onPress={() => setShowImportPdfModal(true)}
            data-testid="import-pdf-btn"
          >
            <WebIcon name="document-attach-outline" size={18} color="white" />
            <Text style={menuRestaurantStyles.exportButtonText}>Import PDF</Text>
          </TouchableOpacity>
          )}
        </View>
      
      {/* Modal Filtre Allergènes */}
      <Modal visible={showAllergenFilter} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 500, width: '95%', maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryColor }]}>Filtrer les allergènes</Text>
              <TouchableOpacity onPress={() => setShowAllergenFilter(false)}>
                <WebIcon name="close" size={28} color={primaryColor} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ color: '#666', marginBottom: 16, fontSize: 13 }}>
              Sélectionnez les allergènes à exclure. Les plats contenant ces allergènes seront masqués.
            </Text>
            
            <ScrollView style={{ maxHeight: 350 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {allAllergens.map(allergen => {
                  const isExcluded = excludedAllergens.includes(allergen);
                  return (
                    <TouchableOpacity
                      key={allergen}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 20,
                        backgroundColor: isExcluded ? '#f44336' : '#f0f0f0',
                        borderWidth: 1,
                        borderColor: isExcluded ? '#d32f2f' : '#ddd'
                      }}
                      onPress={() => {
                        if (isExcluded) {
                          setExcludedAllergens(prev => prev.filter(a => a !== allergen));
                        } else {
                          setExcludedAllergens(prev => [...prev, allergen]);
                        }
                      }}
                      data-testid={`allergen-${allergen}`}
                    >
                      <Text style={{ color: isExcluded ? '#fff' : '#333', fontWeight: isExcluded ? '600' : '400' }}>
                        {allergenLabels[allergen] || allergen}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#ccc', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setExcludedAllergens([])}
              >
                <Text style={{ fontWeight: '600' }}>Réinitialiser</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: primaryColor, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setShowAllergenFilter(false)}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>Appliquer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* ========== SECTION A L'ARDOISE (uniquement pour Carte Food) ========== */}
      {currentTab === 'food' && ardoiseData && (
        <View style={[menuRestaurantStyles.ardoiseContainer, { marginBottom: 16 }]}>
          <View style={menuRestaurantStyles.ardoiseHeader}>
            <View>
              <Text style={menuRestaurantStyles.ardoiseTitle}>A L'ARDOISE</Text>
              <Text style={{ color: '#ffd166', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>Uniquement midi, Lundi au Vendredi, hors jour férié</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity 
                onPress={openArdoiseEditor}
                style={menuRestaurantStyles.ardoiseActionBtn}
                data-testid="edit-ardoise-btn"
              >
                <WebIcon name="pencil" size={16} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={getArdoiseShareLink}
                style={[menuRestaurantStyles.ardoiseActionBtn, { backgroundColor: '#3498db' }]}
                data-testid="share-ardoise-btn"
              >
                <WebIcon name="share-social" size={16} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleExportArdoisePDF}
                style={[menuRestaurantStyles.ardoiseActionBtn, { backgroundColor: '#1A1A2E' }]}
                data-testid="export-ardoise-pdf-btn"
              >
                <WebIcon name="document-text-outline" size={16} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setShowSocialExportMenu(!showSocialExportMenu)}
                style={[menuRestaurantStyles.ardoiseActionBtn, { backgroundColor: '#E1306C' }]}
                data-testid="export-ardoise-social-btn"
              >
                <WebIcon name="logo-instagram" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Menu export réseaux sociaux */}
          {showSocialExportMenu && (
            <View style={{ backgroundColor: '#2d3436', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ color: '#ffd166', fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>📱 Exporter pour réseaux sociaux</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => { handleExportArdoiseSocial('instagram_story'); setShowSocialExportMenu(false); }}
                  style={({ pressed }) => ({ backgroundColor: pressed ? '#C13584' : '#E1306C', padding: 10, borderRadius: 6, flex: 1, minWidth: 100 })}
                >
                  <Text style={{ color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 'bold' }}>Story (9:16)</Text>
                </Pressable>
                <Pressable
                  onPress={() => { handleExportArdoiseSocial('instagram_post'); setShowSocialExportMenu(false); }}
                  style={({ pressed }) => ({ backgroundColor: pressed ? '#C13584' : '#E1306C', padding: 10, borderRadius: 6, flex: 1, minWidth: 100 })}
                >
                  <Text style={{ color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 'bold' }}>Post (1:1)</Text>
                </Pressable>
                <Pressable
                  onPress={() => { handleExportArdoiseSocial('facebook'); setShowSocialExportMenu(false); }}
                  style={({ pressed }) => ({ backgroundColor: pressed ? '#1877F2' : '#4267B2', padding: 10, borderRadius: 6, flex: 1, minWidth: 100 })}
                >
                  <Text style={{ color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 'bold' }}>Facebook</Text>
                </Pressable>
              </View>
            </View>
          )}
          
          {/* Entrée */}
          <View style={menuRestaurantStyles.ardoiseSection}>
            <Text style={menuRestaurantStyles.ardoiseSectionTitle}>ENTRÉE</Text>
            {ardoiseData.entree?.map((item: any, idx: number) => (
              <View key={`entree-${idx}`} style={menuRestaurantStyles.ardoiseItem}>
                <View style={{ flex: 1 }}>
                  <Text style={menuRestaurantStyles.ardoiseItemName}>{item.name || '—'}</Text>
                  {item.description && <Text style={menuRestaurantStyles.ardoiseItemDesc}>{item.description}</Text>}
                </View>
              </View>
            ))}
          </View>
          
          {/* Plat */}
          <View style={menuRestaurantStyles.ardoiseSection}>
            <Text style={menuRestaurantStyles.ardoiseSectionTitle}>PLAT</Text>
            {ardoiseData.plat?.map((item: any, idx: number) => (
              <View key={`plat-${idx}`} style={menuRestaurantStyles.ardoiseItem}>
                <View style={{ flex: 1 }}>
                  <Text style={menuRestaurantStyles.ardoiseItemName}>{item.name || '—'}</Text>
                  {item.description && <Text style={menuRestaurantStyles.ardoiseItemDesc}>{item.description}</Text>}
                </View>
              </View>
            ))}
          </View>
          
          {/* Dessert */}
          <View style={menuRestaurantStyles.ardoiseSection}>
            <Text style={menuRestaurantStyles.ardoiseSectionTitle}>DESSERT</Text>
            {ardoiseData.dessert?.map((item: any, idx: number) => (
              <View key={`dessert-${idx}`} style={menuRestaurantStyles.ardoiseItem}>
                <View style={{ flex: 1 }}>
                  <Text style={menuRestaurantStyles.ardoiseItemName}>{item.name || '—'}</Text>
                  {item.description && <Text style={menuRestaurantStyles.ardoiseItemDesc}>{item.description}</Text>}
                </View>
              </View>
            ))}
          </View>
          
          {/* FORMULES - Section intégrée */}
          <View style={[menuRestaurantStyles.ardoiseSection, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#ffd166' }]}>
            <Text style={menuRestaurantStyles.ardoiseSectionTitle}>FORMULES</Text>
            <View style={menuRestaurantStyles.ardoiseItem}>
              <Text style={menuRestaurantStyles.ardoiseItemName}>Plat du jour</Text>
              <Text style={menuRestaurantStyles.ardoiseItemPrice}>15,90€</Text>
            </View>
            <View style={menuRestaurantStyles.ardoiseItem}>
              <Text style={menuRestaurantStyles.ardoiseItemName}>Entrée + Plat</Text>
              <Text style={menuRestaurantStyles.ardoiseItemPrice}>18,90€</Text>
            </View>
            <View style={menuRestaurantStyles.ardoiseItem}>
              <Text style={menuRestaurantStyles.ardoiseItemName}>Plat + Dessert</Text>
              <Text style={menuRestaurantStyles.ardoiseItemPrice}>18,90€</Text>
            </View>
            <View style={menuRestaurantStyles.ardoiseItem}>
              <Text style={menuRestaurantStyles.ardoiseItemName}>Entrée + Plat + Dessert</Text>
              <Text style={menuRestaurantStyles.ardoiseItemPrice}>23,90€</Text>
            </View>
          </View>
          
          <Text style={menuRestaurantStyles.ardoiseHint}>
            Partagez le lien avec votre équipe cuisine pour qu'ils puissent modifier les plats du jour
          </Text>
        </View>
      )}
      
      {/* Sections with hierarchy */}
      <View style={menuRestaurantStyles.menuContent}>
        {getSectionHierarchy().length === 0 ? (
          <View style={menuRestaurantStyles.emptyState}>
            <Text style={menuRestaurantStyles.emptyText}>Aucune section pour {currentTab === 'food' ? 'Carte Food' : 'Carte Boisson'}</Text>
            <Text style={menuRestaurantStyles.emptyHint}>Commencez par ajouter une section</Text>
          </View>
        ) : (
          getSectionHierarchy().map((section: any) => (
            <View key={section.section_id} id={`section-${section.section_id}`} nativeID={`section-${section.section_id}`}>
              {renderSectionHeader(section, false)}
              {section.subSections?.map((subSection: any) => renderSectionHeader(subSection, true))}
            </View>
          ))
        )}
      </View>
      
      {/* Notes section */}
      {tabNotes.length > 0 && (
        <View style={menuRestaurantStyles.notesSection}>
          <Text style={[menuRestaurantStyles.notesSectionTitle, { color: MENU_COLORS.note }]}>Notes du menu</Text>
          {tabNotes.map((note: any) => renderNote(note))}
        </View>
      )}
      
      {/* Modal: Choice - Sous-section ou Plat? */}
      <Modal visible={showAddChoice} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 350, width: '90%', padding: 24 }]}>
            <Text style={[styles.modalTitle, { color: primaryColor, textAlign: 'center', marginBottom: 20 }]}>
              Que souhaitez-vous ajouter ?
            </Text>
            <Text style={{ color: '#666', textAlign: 'center', marginBottom: 24 }}>
              Dans la section "{addChoiceSection?.name}"
            </Text>
            
            <TouchableOpacity 
              style={[menuRestaurantStyles.choiceButton, { backgroundColor: MENU_COLORS.subSection }]}
              onPress={handleAddSubsection}
            >
              <WebIcon name="folder-outline" size={24} color="white" />
              <Text style={menuRestaurantStyles.choiceButtonText}>Créer une sous-section</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[menuRestaurantStyles.choiceButton, { backgroundColor: primaryColor, marginTop: 12 }]}
              onPress={handleAddItemChoice}
            >
              <WebIcon name="restaurant-outline" size={24} color={secondaryColor} />
              <Text style={[menuRestaurantStyles.choiceButtonText, { color: secondaryColor }]}>Ajouter un plat / produit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ marginTop: 20, alignItems: 'center' }}
              onPress={() => setShowAddChoice(false)}
            >
              <Text style={{ color: '#999' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Modal: Add Section */}
      <Modal visible={showAddSection} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 450, width: '95%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>
                  {newSectionParentId ? 'Nouvelle Sous-section' : `Nouvelle Section (${currentTab === 'food' ? 'Food' : 'Boisson'})`}
                </Text>
                <TouchableOpacity onPress={() => setShowAddSection(false)}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom de la section *</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder={newSectionParentId ? "Ex: Vin blanc, Vin rosé..." : (currentTab === 'food' ? "Ex: Apéro, Entrées, Viandes..." : "Ex: Vins, Bières, Cocktails...")}
                  value={newSectionName} 
                  onChangeText={setNewSectionName}
                />
                
                <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Ordre (optionnel)</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="Ex: 1, 2, 3... (auto si vide)"
                  value={newSectionOrder} 
                  onChangeText={setNewSectionOrder}
                  keyboardType="number-pad"
                />
                
                {currentTab === 'boisson' && (
                  <TouchableOpacity 
                    style={[menuRestaurantStyles.happyHourToggle, { marginTop: 12 }]}
                    onPress={() => setNewSectionHasHappyHour(!newSectionHasHappyHour)}
                  >
                    <View style={[menuRestaurantStyles.checkbox, newSectionHasHappyHour && { backgroundColor: MENU_COLORS.happyHour, borderColor: MENU_COLORS.happyHour }]}>
                      {newSectionHasHappyHour && <WebIcon name="checkmark" size={16} color="white" />}
                    </View>
                    <Text style={[styles.inputLabel, { color: primaryColor, marginLeft: 8, marginBottom: 0 }]}>Activer Happy Hour pour cette section</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: newSectionParentId ? MENU_COLORS.subSection : (currentTab === 'food' ? MENU_COLORS.sectionFood : MENU_COLORS.sectionBoisson), marginTop: 16 }]} 
                  onPress={handleCreateSection}
                  disabled={isLoading}
                >
                  {isLoading ? <ActivityIndicator color="white" /> : <Text style={styles.modalSubmitButtonText}>{newSectionParentId ? 'Créer la sous-section' : 'Créer la section'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Modal: Edit Section */}
      <Modal visible={showEditSection} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '95%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Modifier Section</Text>
                <TouchableOpacity onPress={() => setShowEditSection(false)}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom de la section</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  value={newSectionName} 
                  onChangeText={setNewSectionName}
                />
                
                <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Ordre</Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder="Ex: 1, 2, 3..."
                  value={newSectionOrder} 
                  onChangeText={setNewSectionOrder}
                  keyboardType="number-pad"
                />
                
                {currentTab === 'boisson' && (
                  <TouchableOpacity 
                    style={[menuRestaurantStyles.happyHourToggle, { marginTop: 12 }]}
                    onPress={() => setNewSectionHasHappyHour(!newSectionHasHappyHour)}
                  >
                    <View style={[menuRestaurantStyles.checkbox, newSectionHasHappyHour && { backgroundColor: MENU_COLORS.happyHour, borderColor: MENU_COLORS.happyHour }]}>
                      {newSectionHasHappyHour && <WebIcon name="checkmark" size={16} color="white" />}
                    </View>
                    <Text style={{ color: primaryColor, marginLeft: 8 }}>Happy Hour actif</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 16 }]} 
                  onPress={handleUpdateSection}
                  disabled={isLoading}
                >
                  {isLoading ? <ActivityIndicator color={secondaryColor} /> : <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Enregistrer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Modal: Add Item */}
      <Modal visible={showAddItem} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView style={{ maxHeight: '95%', backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ paddingBottom: 60, backgroundColor: secondaryColor, flexGrow: 1 }}>
              <View style={{ padding: 16 }}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: primaryColor }]}>Ajouter à "{selectedSection?.name}"</Text>
                  <TouchableOpacity onPress={() => { setShowAddItem(false); resetItemForm(); }}>
                    <WebIcon name="close" size={28} color={primaryColor} />
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom *</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: Steak tartare, Mojito..."
                    value={newItemName} 
                    onChangeText={setNewItemName}
                  />
                  
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Ordre (optionnel)</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: 1, 2, 3... (auto si vide)"
                    value={newItemOrder} 
                    onChangeText={setNewItemOrder}
                    keyboardType="number-pad"
                  />
                  
                  {/* Descriptions */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Description(s)</Text>
                  {newItemDescriptions.map((desc, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                      <TextInput 
                        style={[styles.modalInput, { borderColor: primaryColor, flex: 1, marginBottom: 0, minHeight: 100, textAlignVertical: 'top' }]} 
                        placeholder={`Description ${idx + 1}`}
                        value={desc} 
                        onChangeText={(val) => updateDescription(idx, val)}
                        multiline={true}
                        numberOfLines={4}
                      />
                      {newItemDescriptions.length > 1 && (
                        <TouchableOpacity onPress={() => removeDescription(idx)} style={{ padding: 8 }}>
                          <WebIcon name="close-circle" size={20} color="#C84B31" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity onPress={addDescription} style={menuRestaurantStyles.addRowButton}>
                    <Text style={menuRestaurantStyles.addRowButtonText}>+ Ajouter description</Text>
                  </TouchableOpacity>
                  
                  {/* Prix simple (surtout pour Food) */}
                  {currentTab === 'food' && (
                    <>
                      <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Prix TTC (€)</Text>
                      <TextInput 
                        style={[styles.modalInput, { borderColor: primaryColor }]} 
                        placeholder="Ex: 15,50"
                        value={newItemPrice} 
                        onChangeText={setNewItemPrice}
                        keyboardType="decimal-pad"
                      />
                      
                      {/* Prix Happy Hour avec calculatrice */}
                      <Text style={[styles.inputLabel, { color: '#FF9800', marginTop: 12 }]}>Prix Happy Hour (€)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput 
                          style={[styles.modalInput, { borderColor: '#FF9800', flex: 1, marginRight: 8, marginBottom: 0 }]} 
                          placeholder="Ex: 12,00"
                          value={newItemHappyHourPrice} 
                          onChangeText={setNewItemHappyHourPrice}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      
                      {/* Calculatrice de remise */}
                      <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: '#FF9800', marginBottom: 8 }}>Calculer la remise Happy Hour :</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff' }} 
                            placeholder="Remise"
                            value={newItemHappyHourDiscount} 
                            onChangeText={setNewItemHappyHourDiscount}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity 
                            onPress={() => setNewItemHappyHourDiscountType('percent')}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 4, backgroundColor: newItemHappyHourDiscountType === 'percent' ? '#FF9800' : '#f0f0f0' }}
                          >
                            <Text style={{ color: newItemHappyHourDiscountType === 'percent' ? '#fff' : '#666', fontWeight: '600' }}>%</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => setNewItemHappyHourDiscountType('euro')}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 8, backgroundColor: newItemHappyHourDiscountType === 'euro' ? '#FF9800' : '#f0f0f0' }}
                          >
                            <Text style={{ color: newItemHappyHourDiscountType === 'euro' ? '#fff' : '#666', fontWeight: '600' }}>€</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={calculateHappyHourPrice}
                            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: '#FF9800' }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Calculer</Text>
                          </TouchableOpacity>
                        </View>
                        {newItemHappyHourDiscount && newItemPrice && (
                          <Text style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                            Exemple : {newItemPrice}€ - {newItemHappyHourDiscount}{newItemHappyHourDiscountType === 'percent' ? '%' : '€'} = {
                              newItemHappyHourDiscountType === 'percent' 
                                ? ((parseFloat(newItemPrice.replace(',', '.')) || 0) * (1 - (parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0) / 100)).toFixed(2)
                                : ((parseFloat(newItemPrice.replace(',', '.')) || 0) - (parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0)).toFixed(2)
                            }€
                          </Text>
                        )}
                      </View>
                      
                      {/* TVA */}
                      <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 4 }]}>TVA applicable</Text>
                      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                        <TouchableOpacity 
                          onPress={() => setNewItemTvaRate('10')}
                          style={{ flex: 1, padding: 12, marginRight: 8, borderRadius: 8, borderWidth: 2, borderColor: newItemTvaRate === '10' ? primaryColor : '#ddd', backgroundColor: newItemTvaRate === '10' ? primaryColor + '15' : '#f9f9f9' }}
                        >
                          <Text style={{ textAlign: 'center', fontWeight: '600', color: newItemTvaRate === '10' ? primaryColor : '#666' }}>TVA 10%</Text>
                          <Text style={{ textAlign: 'center', fontSize: 11, color: '#888', marginTop: 2 }}>Restauration sur place</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => setNewItemTvaRate('20')}
                          style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 2, borderColor: newItemTvaRate === '20' ? primaryColor : '#ddd', backgroundColor: newItemTvaRate === '20' ? primaryColor + '15' : '#f9f9f9' }}
                        >
                          <Text style={{ textAlign: 'center', fontWeight: '600', color: newItemTvaRate === '20' ? primaryColor : '#666' }}>TVA 20%</Text>
                          <Text style={{ textAlign: 'center', fontSize: 11, color: '#888', marginTop: 2 }}>Alcools, vente à emporter</Text>
                        </TouchableOpacity>
                      </View>
                      {newItemPrice && (
                        <View style={{ backgroundColor: '#f0f0f0', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                          <Text style={{ fontSize: 12, color: '#666' }}>
                            Prix HT : {calculatePriceHT(parseFloat(newItemPrice.replace(',', '.')) || 0, parseInt(newItemTvaRate)).toFixed(2)}€
                            {' '}| TVA {newItemTvaRate}% : {((parseFloat(newItemPrice.replace(',', '.')) || 0) - calculatePriceHT(parseFloat(newItemPrice.replace(',', '.')) || 0, parseInt(newItemTvaRate))).toFixed(2)}€
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  
                  {/* Multi-formats pour Boisson */}
                  {/* Formats & Prix - Pour Food ET Boisson */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>📦 Formats & Prix (Multi-tailles)</Text>
                  <Text style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Ajoutez différentes tailles avec leurs prix (optionnel si prix unique)</Text>
                  
                  {newItemFormats.map((fmt, idx) => (
                    <View key={idx} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput 
                          style={[menuRestaurantStyles.formatInput, { flex: 1, marginRight: 8 }]}
                          placeholder="Taille (Petit, Grand, 25cl...)"
                          value={fmt.name}
                          onChangeText={(val) => updateFormat(idx, 'name', val)}
                        />
                        <TouchableOpacity onPress={() => removeFormat(idx)} style={{ padding: 4 }}>
                          <WebIcon name="close-circle" size={22} color="#C84B31" />
                        </TouchableOpacity>
                      </View>
                      
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>Prix de vente</Text>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput]}
                            placeholder="Prix €"
                            value={fmt.price}
                            onChangeText={(val) => updateFormat(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        
                        {/* Happy Hour - Remise */}
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>Remise HH</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TextInput 
                              style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                              placeholder="Remise"
                              value={fmt.hh_discount || ''}
                              onChangeText={(val) => {
                                const updated = [...newItemFormats];
                                updated[idx].hh_discount = val;
                                // Calculer le prix HH automatiquement
                                const price = parseFloat(updated[idx].price) || 0;
                                const discount = parseFloat(val) || 0;
                                if (price > 0 && discount > 0) {
                                  if (updated[idx].hh_discount_type === 'percent') {
                                    updated[idx].happy_hour_price = (price - (price * discount / 100)).toFixed(2);
                                  } else {
                                    updated[idx].happy_hour_price = (price - discount).toFixed(2);
                                  }
                                }
                                setNewItemFormats(updated);
                              }}
                              keyboardType="decimal-pad"
                            />
                            <TouchableOpacity 
                              style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: (fmt.hh_discount_type || 'percent') === 'percent' ? primaryColor : '#e0e0e0', borderRadius: 4, marginLeft: 4 }}
                              onPress={() => {
                                const updated = [...newItemFormats];
                                const currentType = updated[idx].hh_discount_type || 'percent';
                                updated[idx].hh_discount_type = currentType === 'percent' ? 'euro' : 'percent';
                                // Recalculer
                                const price = parseFloat(updated[idx].price) || 0;
                                const discount = parseFloat(updated[idx].hh_discount) || 0;
                                if (price > 0 && discount > 0) {
                                  if (updated[idx].hh_discount_type === 'percent') {
                                    updated[idx].happy_hour_price = (price - (price * discount / 100)).toFixed(2);
                                  } else {
                                    updated[idx].happy_hour_price = (price - discount).toFixed(2);
                                  }
                                }
                                setNewItemFormats(updated);
                              }}
                            >
                              <Text style={{ fontSize: 11, color: (fmt.hh_discount_type || 'percent') === 'percent' ? '#fff' : '#666', fontWeight: '600' }}>
                                {(fmt.hh_discount_type || 'percent') === 'percent' ? '%' : '€'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        
                        {/* Prix HH calculé */}
                        <View style={{ width: 70 }}>
                          <Text style={{ fontSize: 10, color: '#ff9800', marginBottom: 2 }}>Prix HH</Text>
                          <View style={{ backgroundColor: '#fff3e0', padding: 8, borderRadius: 4, alignItems: 'center' }}>
                            <Text style={{ color: '#ff9800', fontWeight: '600' }}>{fmt.happy_hour_price || '-'}€</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  <TouchableOpacity onPress={() => setNewItemFormats([...newItemFormats, { name: '', price: '', happy_hour_price: '', hh_discount: '', hh_discount_type: 'percent' }])} style={menuRestaurantStyles.addRowButton}>
                    <Text style={menuRestaurantStyles.addRowButtonText}>+ Ajouter un format / taille</Text>
                  </TouchableOpacity>
                  
                  {/* Suggestions (Succession) pour Food */}
                  {currentTab === 'food' && (
                    <>
                      <Text style={[styles.inputLabel, { color: MENU_COLORS.suggestion, marginTop: 16 }]}>Suggestions (Succession)</Text>
                      {newItemSuggestions.map((sug, idx) => (
                        <View key={idx} style={menuRestaurantStyles.formatRow}>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                            placeholder="Ex: Verre de vin blanc"
                            value={sug.name}
                            onChangeText={(val) => updateSuggestion(idx, 'name', val)}
                          />
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { width: 80 }]}
                            placeholder="Suppl.€"
                            value={sug.price}
                            onChangeText={(val) => updateSuggestion(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity onPress={() => removeSuggestion(idx)} style={{ padding: 4 }}>
                            <WebIcon name="close-circle" size={20} color="#C84B31" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={addSuggestion} style={[menuRestaurantStyles.addRowButton, { borderColor: MENU_COLORS.suggestion }]}>
                        <Text style={[menuRestaurantStyles.addRowButtonText, { color: MENU_COLORS.suggestion }]}>+ Ajouter suggestion</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  {/* Suppléments pour Boisson */}
                  {currentTab === 'boisson' && (
                    <>
                      <Text style={[styles.inputLabel, { color: MENU_COLORS.supplement, marginTop: 16 }]}>Suppléments</Text>
                      {newItemSupplements.map((sup, idx) => (
                        <View key={idx} style={menuRestaurantStyles.formatRow}>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                            placeholder="Ex: Coca, Limonade..."
                            value={sup.name}
                            onChangeText={(val) => updateSupplement(idx, 'name', val)}
                          />
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { width: 80 }]}
                            placeholder="Suppl.€"
                            value={sup.price}
                            onChangeText={(val) => updateSupplement(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity onPress={() => removeSupplement(idx)} style={{ padding: 4 }}>
                            <WebIcon name="close-circle" size={20} color="#C84B31" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={addSupplement} style={[menuRestaurantStyles.addRowButton, { borderColor: MENU_COLORS.supplement }]}>
                        <Text style={[menuRestaurantStyles.addRowButtonText, { color: MENU_COLORS.supplement }]}>+ Ajouter supplément</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  {/* Options payantes pour Food (ex: +2€ Jambon, +3€ Saumon) */}
                  {currentTab === 'food' && (
                    <>
                      <Text style={[styles.inputLabel, { color: '#2e7d32', marginTop: 16 }]}>Options payantes</Text>
                      <Text style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Ex: +2€ Jambon Serrano, +3€ Saumon fumé</Text>
                      {newItemOptions.map((opt, idx) => (
                        <View key={idx} style={menuRestaurantStyles.formatRow}>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                            placeholder="Nom de l'option"
                            value={opt.name}
                            onChangeText={(val) => updateOption(idx, 'name', val)}
                          />
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { width: 80 }]}
                            placeholder="+€"
                            value={opt.price}
                            onChangeText={(val) => updateOption(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity onPress={() => removeOption(idx)} style={{ padding: 4 }}>
                            <WebIcon name="close-circle" size={20} color="#C84B31" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={addOption} style={[menuRestaurantStyles.addRowButton, { borderColor: '#2e7d32' }]}>
                        <Text style={[menuRestaurantStyles.addRowButtonText, { color: '#2e7d32' }]}>+ Ajouter une option</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  {/* Statut / Couleur pour Excel */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>Statut (Coloration Excel)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {STATUS_LIST.map((status) => (
                      <TouchableOpacity 
                        key={status.id}
                        onPress={() => {
                          setNewItemStatus(status.id);
                          // Réinitialiser les champs modifiés quand on change de statut
                          if (status.id !== 'a_modifier') {
                            setNewItemModifiedFields([]);
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 2,
                          borderColor: status.borderColor,
                          backgroundColor: newItemStatus === status.id ? status.color : 'transparent',
                        }}
                      >
                        <Text style={{ 
                          color: newItemStatus === status.id ? '#fff' : status.color === 'transparent' ? '#666' : status.color,
                          fontWeight: newItemStatus === status.id ? 'bold' : 'normal'
                        }}>
                          {status.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Checkboxes pour "En modification" - UNIQUEMENT quand ce statut est sélectionné */}
                  {newItemStatus === 'a_modifier' && (
                    <View style={{ backgroundColor: '#f0e6ff', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                      <Text style={{ fontWeight: 'bold', color: '#9B59B6', marginBottom: 8 }}>
                        Quels champs avez-vous modifiés ?
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {[
                          { id: 'name', label: 'Plat (nom)' },
                          { id: 'price', label: 'Prix' },
                          { id: 'description', label: 'Description' }
                        ].map((field) => (
                          <TouchableOpacity 
                            key={field.id}
                            onPress={() => {
                              if (newItemModifiedFields.includes(field.id)) {
                                setNewItemModifiedFields(newItemModifiedFields.filter(f => f !== field.id));
                              } else {
                                setNewItemModifiedFields([...newItemModifiedFields, field.id]);
                              }
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: newItemModifiedFields.includes(field.id) ? '#9B59B6' : '#ddd',
                              backgroundColor: newItemModifiedFields.includes(field.id) ? '#9B59B6' : '#fff',
                            }}
                          >
                            <WebIcon 
                              name={newItemModifiedFields.includes(field.id) ? 'checkbox' : 'square-outline'} 
                              size={20} 
                              color={newItemModifiedFields.includes(field.id) ? '#fff' : '#666'} 
                            />
                            <Text style={{ 
                              marginLeft: 6,
                              color: newItemModifiedFields.includes(field.id) ? '#fff' : '#333',
                              fontWeight: newItemModifiedFields.includes(field.id) ? 'bold' : 'normal'
                            }}>
                              {field.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                        Seuls les champs cochés seront colorés en violet dans l'export Excel
                      </Text>
                    </View>
                  )}
                  
                  {/* Tags (Végan, Végétarien, Épicé) */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Tags</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {TAGS_LIST.map((tag) => (
                      <TouchableOpacity 
                        key={tag.id}
                        onPress={() => toggleTag(tag.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 2,
                          borderColor: newItemTags.includes(tag.id) ? '#28a745' : '#ccc',
                          backgroundColor: newItemTags.includes(tag.id) ? '#28a745' : 'transparent',
                        }}
                      >
                        <Text style={{ 
                          color: newItemTags.includes(tag.id) ? '#fff' : '#666',
                          fontWeight: newItemTags.includes(tag.id) ? 'bold' : 'normal'
                        }}>
                          {tag.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Allergènes (14 cases à cocher) */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Allergènes</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {ALLERGENS_LIST.map((allergen) => (
                      <TouchableOpacity 
                        key={allergen.id}
                        onPress={() => toggleAllergen(allergen.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          borderColor: newItemAllergens.includes(allergen.id) ? '#e74c3c' : '#ddd',
                          backgroundColor: newItemAllergens.includes(allergen.id) ? '#fef2f2' : '#f9f9f9',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 13,
                          color: newItemAllergens.includes(allergen.id) ? '#c0392b' : '#666',
                          fontWeight: newItemAllergens.includes(allergen.id) ? '600' : 'normal'
                        }}>
                          {allergen.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 20 }]} 
                    onPress={handleCreateItem}
                    disabled={isLoading}
                  >
                    {isLoading ? <ActivityIndicator color={secondaryColor} /> : <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Ajouter l'item</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Modal: Edit Item */}
      <Modal visible={showEditItem} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView style={{ maxHeight: '95%', backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ paddingBottom: 60, backgroundColor: secondaryColor, flexGrow: 1 }}>
              <View style={{ padding: 16 }}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: primaryColor }]}>Modifier "{editingItem?.name}"</Text>
                  <TouchableOpacity onPress={() => { setShowEditItem(false); resetItemForm(); }}>
                    <WebIcon name="close" size={28} color={primaryColor} />
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom *</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    value={newItemName} 
                    onChangeText={setNewItemName}
                  />
                  
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Ordre</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: 1, 2, 3..."
                    value={newItemOrder} 
                    onChangeText={setNewItemOrder}
                    keyboardType="number-pad"
                  />
                  
                  {/* Descriptions */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Description(s)</Text>
                  {newItemDescriptions.map((desc, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                      <TextInput 
                        style={[styles.modalInput, { borderColor: primaryColor, flex: 1, marginBottom: 0, minHeight: 100, textAlignVertical: 'top' }]} 
                        placeholder={`Description ${idx + 1}`}
                        value={desc} 
                        onChangeText={(val) => updateDescription(idx, val)}
                        multiline={true}
                        numberOfLines={4}
                      />
                      {newItemDescriptions.length > 1 && (
                        <TouchableOpacity onPress={() => removeDescription(idx)} style={{ padding: 8 }}>
                          <WebIcon name="close-circle" size={20} color="#C84B31" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity onPress={addDescription} style={menuRestaurantStyles.addRowButton}>
                    <Text style={menuRestaurantStyles.addRowButtonText}>+ Ajouter description</Text>
                  </TouchableOpacity>
                  
                  {/* Prix simple */}
                  {currentTab === 'food' && (
                    <>
                      <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Prix TTC (€)</Text>
                      <TextInput 
                        style={[styles.modalInput, { borderColor: primaryColor }]} 
                        value={newItemPrice} 
                        onChangeText={setNewItemPrice}
                        keyboardType="decimal-pad"
                      />
                      
                      {/* Prix Happy Hour avec calculatrice */}
                      <Text style={[styles.inputLabel, { color: '#FF9800', marginTop: 12 }]}>Prix Happy Hour (€)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput 
                          style={[styles.modalInput, { borderColor: '#FF9800', flex: 1, marginRight: 8, marginBottom: 0 }]} 
                          placeholder="Ex: 12,00"
                          value={newItemHappyHourPrice} 
                          onChangeText={setNewItemHappyHourPrice}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      
                      {/* Calculatrice de remise */}
                      <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: '#FF9800', marginBottom: 8 }}>Calculer la remise Happy Hour :</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff' }} 
                            placeholder="Remise"
                            value={newItemHappyHourDiscount} 
                            onChangeText={setNewItemHappyHourDiscount}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity 
                            onPress={() => setNewItemHappyHourDiscountType('percent')}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 4, backgroundColor: newItemHappyHourDiscountType === 'percent' ? '#FF9800' : '#f0f0f0' }}
                          >
                            <Text style={{ color: newItemHappyHourDiscountType === 'percent' ? '#fff' : '#666', fontWeight: '600' }}>%</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => setNewItemHappyHourDiscountType('euro')}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginRight: 8, backgroundColor: newItemHappyHourDiscountType === 'euro' ? '#FF9800' : '#f0f0f0' }}
                          >
                            <Text style={{ color: newItemHappyHourDiscountType === 'euro' ? '#fff' : '#666', fontWeight: '600' }}>€</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={calculateHappyHourPrice}
                            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: '#FF9800' }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Calculer</Text>
                          </TouchableOpacity>
                        </View>
                        {newItemHappyHourDiscount && newItemPrice && (
                          <Text style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                            Exemple : {newItemPrice}€ - {newItemHappyHourDiscount}{newItemHappyHourDiscountType === 'percent' ? '%' : '€'} = {
                              newItemHappyHourDiscountType === 'percent' 
                                ? ((parseFloat(newItemPrice.replace(',', '.')) || 0) * (1 - (parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0) / 100)).toFixed(2)
                                : ((parseFloat(newItemPrice.replace(',', '.')) || 0) - (parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0)).toFixed(2)
                            }€
                          </Text>
                        )}
                      </View>
                    </>
                  )}
                  
                  {/* Prix simple et Happy Hour pour BOISSON */}
                  {currentTab === 'boisson' && (
                    <>
                      <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Prix TTC (€)</Text>
                      <TextInput 
                        style={[styles.modalInput, { borderColor: primaryColor }]} 
                        value={newItemPrice} 
                        onChangeText={setNewItemPrice}
                        placeholder="Prix unique (si pas de multi-tailles)"
                        keyboardType="decimal-pad"
                      />
                      
                      {/* Prix Happy Hour avec calculatrice */}
                      <Text style={[styles.inputLabel, { color: '#FF9800', marginTop: 12 }]}>Prix Happy Hour (€)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput 
                          style={[styles.modalInput, { borderColor: '#FF9800', flex: 1, marginRight: 8, marginBottom: 0 }]} 
                          placeholder="Ex: 4,50"
                          value={newItemHappyHourPrice} 
                          onChangeText={setNewItemHappyHourPrice}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      
                      {/* Calculatrice de remise */}
                      <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: '#FF9800', marginBottom: 8 }}>Calculer la remise Happy Hour :</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <TextInput 
                            style={{ flex: 1, minWidth: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' }} 
                            placeholder="Remise"
                            value={newItemHappyHourDiscount} 
                            onChangeText={setNewItemHappyHourDiscount}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity 
                            onPress={() => setNewItemHappyHourDiscountType('percent')}
                            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, backgroundColor: newItemHappyHourDiscountType === 'percent' ? '#FF9800' : '#f0f0f0' }}
                          >
                            <Text style={{ color: newItemHappyHourDiscountType === 'percent' ? '#fff' : '#666', fontWeight: '600', fontSize: 14 }}>%</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => setNewItemHappyHourDiscountType('euro')}
                            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, backgroundColor: newItemHappyHourDiscountType === 'euro' ? '#FF9800' : '#f0f0f0' }}
                          >
                            <Text style={{ color: newItemHappyHourDiscountType === 'euro' ? '#fff' : '#666', fontWeight: '600', fontSize: 14 }}>€</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={calculateHappyHourPrice}
                            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, backgroundColor: '#FF9800' }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Calculer</Text>
                          </TouchableOpacity>
                        </View>
                        {newItemHappyHourDiscount && newItemPrice && (
                          <Text style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                            Exemple : {newItemPrice}€ - {newItemHappyHourDiscount}{newItemHappyHourDiscountType === 'percent' ? '%' : '€'} = {
                              newItemHappyHourDiscountType === 'percent' 
                                ? ((parseFloat(newItemPrice.replace(',', '.')) || 0) * (1 - (parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0) / 100)).toFixed(2)
                                : ((parseFloat(newItemPrice.replace(',', '.')) || 0) - (parseFloat(newItemHappyHourDiscount.replace(',', '.')) || 0)).toFixed(2)
                            }€
                          </Text>
                        )}
                      </View>
                    </>
                  )}
                  
                  {/* Multi-formats pour Food ET Boisson */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>📦 Formats & Prix (Multi-tailles)</Text>
                  <Text style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Ajoutez différentes tailles avec leurs prix</Text>
                  
                  {newItemFormats.map((fmt, idx) => (
                    <View key={idx} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      {/* Ligne 1: Nom de la taille */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput 
                          style={[menuRestaurantStyles.formatInput, { flex: 1, marginRight: 8 }]}
                          placeholder="Taille (Petit, Grand, 25cl...)"
                          value={fmt.name}
                          onChangeText={(val) => updateFormat(idx, 'name', val)}
                        />
                        <TouchableOpacity onPress={() => removeFormat(idx)} style={{ padding: 4 }}>
                          <WebIcon name="close-circle" size={22} color="#C84B31" />
                        </TouchableOpacity>
                      </View>
                      
                      {/* Ligne 2: Prix et Prix HH */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>Prix TTC</Text>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput]}
                            placeholder="Prix €"
                            value={fmt.price}
                            onChangeText={(val) => updateFormat(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: '#ff9800', marginBottom: 2 }}>Prix Happy Hour</Text>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { borderColor: '#ff9800' }]}
                            placeholder="Prix HH €"
                            value={fmt.happy_hour_price || ''}
                            onChangeText={(val) => updateFormat(idx, 'happy_hour_price', val)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                      
                      {/* Ligne 3: Calculatrice remise avec boutons % et € bien visibles */}
                      <View style={{ backgroundColor: '#fff3e0', borderRadius: 8, padding: 10 }}>
                        <Text style={{ fontSize: 11, color: '#ff9800', marginBottom: 6, fontWeight: '600' }}>Calculer remise :</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, backgroundColor: '#fff', marginRight: 8 }}
                            placeholder="Remise"
                            value={fmt.hh_discount || ''}
                            onChangeText={(val) => {
                              const updated = [...newItemFormats];
                              updated[idx].hh_discount = val;
                              if (!val || val.trim() === '') {
                                updated[idx].happy_hour_price = '';
                              } else {
                                const price = parseFloat(updated[idx].price) || 0;
                                const discount = parseFloat(val) || 0;
                                if (price > 0 && discount > 0) {
                                  const discountType = updated[idx].hh_discount_type || 'percent';
                                  if (discountType === 'percent') {
                                    updated[idx].happy_hour_price = (price - (price * discount / 100)).toFixed(2);
                                  } else {
                                    updated[idx].happy_hour_price = (price - discount).toFixed(2);
                                  }
                                }
                              }
                              setNewItemFormats(updated);
                            }}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity 
                            style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: (fmt.hh_discount_type || 'percent') === 'percent' ? '#FF9800' : '#e0e0e0', borderRadius: 6, marginRight: 6 }}
                            onPress={() => {
                              const updated = [...newItemFormats];
                              updated[idx].hh_discount_type = 'percent';
                              const price = parseFloat(updated[idx].price) || 0;
                              const discount = parseFloat(updated[idx].hh_discount) || 0;
                              if (price > 0 && discount > 0) {
                                updated[idx].happy_hour_price = (price - (price * discount / 100)).toFixed(2);
                              }
                              setNewItemFormats(updated);
                            }}
                          >
                            <Text style={{ fontSize: 16, color: (fmt.hh_discount_type || 'percent') === 'percent' ? '#fff' : '#666', fontWeight: '700' }}>%</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: fmt.hh_discount_type === 'euro' ? '#4CAF50' : '#e0e0e0', borderRadius: 6 }}
                            onPress={() => {
                              const updated = [...newItemFormats];
                              updated[idx].hh_discount_type = 'euro';
                              const price = parseFloat(updated[idx].price) || 0;
                              const discount = parseFloat(updated[idx].hh_discount) || 0;
                              if (price > 0 && discount > 0) {
                                updated[idx].happy_hour_price = (price - discount).toFixed(2);
                              }
                              setNewItemFormats(updated);
                            }}
                          >
                            <Text style={{ fontSize: 16, color: fmt.hh_discount_type === 'euro' ? '#fff' : '#666', fontWeight: '700' }}>€</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  <TouchableOpacity onPress={() => setNewItemFormats([...newItemFormats, { name: '', price: '', happy_hour_price: '', hh_discount: '', hh_discount_type: 'percent' }])} style={menuRestaurantStyles.addRowButton}>
                    <Text style={menuRestaurantStyles.addRowButtonText}>+ Ajouter un format / taille</Text>
                  </TouchableOpacity>
                  
                  {/* Suggestions pour Food */}
                  {currentTab === 'food' && (
                    <>
                      <Text style={[styles.inputLabel, { color: MENU_COLORS.suggestion, marginTop: 16 }]}>Suggestions (Succession)</Text>
                      {newItemSuggestions.map((sug, idx) => (
                        <View key={idx} style={menuRestaurantStyles.formatRow}>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                            placeholder="Suggestion"
                            value={sug.name}
                            onChangeText={(val) => updateSuggestion(idx, 'name', val)}
                          />
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { width: 80 }]}
                            placeholder="€"
                            value={sug.price}
                            onChangeText={(val) => updateSuggestion(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity onPress={() => removeSuggestion(idx)} style={{ padding: 4 }}>
                            <WebIcon name="close-circle" size={20} color="#C84B31" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={addSuggestion} style={[menuRestaurantStyles.addRowButton, { borderColor: MENU_COLORS.suggestion }]}>
                        <Text style={[menuRestaurantStyles.addRowButtonText, { color: MENU_COLORS.suggestion }]}>+ Suggestion</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  {/* Suppléments pour Boisson */}
                  {currentTab === 'boisson' && (
                    <>
                      <Text style={[styles.inputLabel, { color: MENU_COLORS.supplement, marginTop: 16 }]}>Suppléments</Text>
                      {newItemSupplements.map((sup, idx) => (
                        <View key={idx} style={menuRestaurantStyles.formatRow}>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                            placeholder="Supplément"
                            value={sup.name}
                            onChangeText={(val) => updateSupplement(idx, 'name', val)}
                          />
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { width: 80 }]}
                            placeholder="€"
                            value={sup.price}
                            onChangeText={(val) => updateSupplement(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity onPress={() => removeSupplement(idx)} style={{ padding: 4 }}>
                            <WebIcon name="close-circle" size={20} color="#C84B31" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={addSupplement} style={[menuRestaurantStyles.addRowButton, { borderColor: MENU_COLORS.supplement }]}>
                        <Text style={[menuRestaurantStyles.addRowButtonText, { color: MENU_COLORS.supplement }]}>+ Supplément</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  {/* Options payantes pour Food (ex: +2€ Jambon, +3€ Saumon) */}
                  {currentTab === 'food' && (
                    <>
                      <Text style={[styles.inputLabel, { color: '#2e7d32', marginTop: 16 }]}>Options payantes</Text>
                      <Text style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Ex: +2€ Jambon Serrano, +3€ Saumon fumé</Text>
                      {newItemOptions.map((opt, idx) => (
                        <View key={idx} style={menuRestaurantStyles.formatRow}>
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { flex: 1 }]}
                            placeholder="Nom de l'option"
                            value={opt.name}
                            onChangeText={(val) => updateOption(idx, 'name', val)}
                          />
                          <TextInput 
                            style={[menuRestaurantStyles.formatInput, { width: 80 }]}
                            placeholder="+€"
                            value={opt.price}
                            onChangeText={(val) => updateOption(idx, 'price', val)}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity onPress={() => removeOption(idx)} style={{ padding: 4 }}>
                            <WebIcon name="close-circle" size={20} color="#C84B31" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={addOption} style={[menuRestaurantStyles.addRowButton, { borderColor: '#2e7d32' }]}>
                        <Text style={[menuRestaurantStyles.addRowButtonText, { color: '#2e7d32' }]}>+ Ajouter une option</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* TVA applicable */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>TVA applicable</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                    <TouchableOpacity 
                      style={{ flex: 1, padding: 14, borderRadius: 10, borderWidth: 2, borderColor: newItemTvaRate === '10' ? primaryColor : '#ddd', backgroundColor: newItemTvaRate === '10' ? primaryColor + '15' : '#fff' }} 
                      onPress={() => setNewItemTvaRate('10')}
                    >
                      <Text style={{ textAlign: 'center', fontWeight: '600', color: newItemTvaRate === '10' ? primaryColor : '#666' }}>TVA 10%</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ flex: 1, padding: 14, borderRadius: 10, borderWidth: 2, borderColor: newItemTvaRate === '20' ? primaryColor : '#ddd', backgroundColor: newItemTvaRate === '20' ? primaryColor + '15' : '#fff' }} 
                      onPress={() => setNewItemTvaRate('20')}
                    >
                      <Text style={{ textAlign: 'center', fontWeight: '600', color: newItemTvaRate === '20' ? primaryColor : '#666' }}>TVA 20%</Text>
                    </TouchableOpacity>
                  </View>
                  {newItemPrice && (
                    <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                      Prix HT : {calculatePriceHT(parseFloat(newItemPrice.replace(',', '.')) || 0, parseInt(newItemTvaRate)).toFixed(2)}€
                      {' '}| TVA {newItemTvaRate}% : {((parseFloat(newItemPrice.replace(',', '.')) || 0) - calculatePriceHT(parseFloat(newItemPrice.replace(',', '.')) || 0, parseInt(newItemTvaRate))).toFixed(2)}€
                    </Text>
                  )}
                  
                  {/* Statut / Couleur pour Excel */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>Statut (Coloration Excel)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {STATUS_LIST.map((status) => (
                      <TouchableOpacity 
                        key={status.id}
                        onPress={() => {
                          setNewItemStatus(status.id);
                          // Réinitialiser les champs modifiés quand on change de statut
                          if (status.id !== 'a_modifier') {
                            setNewItemModifiedFields([]);
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 2,
                          borderColor: status.borderColor,
                          backgroundColor: newItemStatus === status.id ? status.color : 'transparent',
                        }}
                      >
                        <Text style={{ 
                          color: newItemStatus === status.id ? '#fff' : status.color === 'transparent' ? '#666' : status.color,
                          fontWeight: newItemStatus === status.id ? 'bold' : 'normal'
                        }}>
                          {status.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Checkboxes pour "En modification" - UNIQUEMENT quand ce statut est sélectionné */}
                  {newItemStatus === 'a_modifier' && (
                    <View style={{ backgroundColor: '#f0e6ff', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                      <Text style={{ fontWeight: 'bold', color: '#9B59B6', marginBottom: 8 }}>
                        Quels champs avez-vous modifiés ?
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {[
                          { id: 'name', label: 'Plat (nom)' },
                          { id: 'price', label: 'Prix' },
                          { id: 'description', label: 'Description' }
                        ].map((field) => (
                          <TouchableOpacity 
                            key={field.id}
                            onPress={() => {
                              if (newItemModifiedFields.includes(field.id)) {
                                setNewItemModifiedFields(newItemModifiedFields.filter(f => f !== field.id));
                              } else {
                                setNewItemModifiedFields([...newItemModifiedFields, field.id]);
                              }
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: newItemModifiedFields.includes(field.id) ? '#9B59B6' : '#ddd',
                              backgroundColor: newItemModifiedFields.includes(field.id) ? '#9B59B6' : '#fff',
                            }}
                          >
                            <WebIcon 
                              name={newItemModifiedFields.includes(field.id) ? 'checkbox' : 'square-outline'} 
                              size={20} 
                              color={newItemModifiedFields.includes(field.id) ? '#fff' : '#666'} 
                            />
                            <Text style={{ 
                              marginLeft: 6,
                              color: newItemModifiedFields.includes(field.id) ? '#fff' : '#333',
                              fontWeight: newItemModifiedFields.includes(field.id) ? 'bold' : 'normal'
                            }}>
                              {field.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                        Seuls les champs cochés seront colorés en violet dans l'export Excel
                      </Text>
                    </View>
                  )}

                  {/* Options de cuisson (pour viandes, etc.) */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>Options de cuisson</Text>
                  <View style={{ backgroundColor: '#fef6e8', padding: 12, borderRadius: 10, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <TouchableOpacity
                        onPress={() => setNewItemRequiresCooking(!newItemRequiresCooking)}
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                      >
                        <WebIcon 
                          name={newItemRequiresCooking ? 'checkbox' : 'square-outline'} 
                          size={24} 
                          color={newItemRequiresCooking ? '#e67e22' : '#999'} 
                        />
                        <Text style={{ marginLeft: 8, fontWeight: '600', color: newItemRequiresCooking ? '#e67e22' : '#666' }}>
                          Demander la cuisson au client
                        </Text>
                      </TouchableOpacity>
                    </View>
                    
                    {newItemRequiresCooking && (
                      <>
                        <Text style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                          Sélectionnez les cuissons disponibles :
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {COOKING_OPTIONS_PRESETS.map((option) => (
                            <TouchableOpacity 
                              key={option}
                              onPress={() => {
                                if (newItemCookingOptions.includes(option)) {
                                  setNewItemCookingOptions(newItemCookingOptions.filter(o => o !== option));
                                } else {
                                  setNewItemCookingOptions([...newItemCookingOptions, option]);
                                }
                              }}
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 20,
                                borderWidth: 2,
                                borderColor: newItemCookingOptions.includes(option) ? '#e67e22' : '#ddd',
                                backgroundColor: newItemCookingOptions.includes(option) ? '#e67e22' : '#fff',
                              }}
                            >
                              <Text style={{ 
                                color: newItemCookingOptions.includes(option) ? '#fff' : '#666',
                                fontWeight: newItemCookingOptions.includes(option) ? 'bold' : 'normal'
                              }}>
                                {option}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                  
                  {/* ID Zelty (intégration caisse) */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>ID Zelty (Caisse)</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: '#17a2b8', backgroundColor: '#f0fafc' }]}
                    value={newItemZeltyId}
                    onChangeText={setNewItemZeltyId}
                    placeholder="Ex: 12345 (optionnel - pour intégration caisse)"
                    placeholderTextColor="#aaa"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 2, marginBottom: 8 }}>
                    Laissez vide si vous n'utilisez pas Zelty
                  </Text>
                  
                  {/* Tags (Végan, Végétarien, Épicé) */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Tags</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {TAGS_LIST.map((tag) => (
                      <TouchableOpacity 
                        key={tag.id}
                        onPress={() => toggleTag(tag.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 2,
                          borderColor: newItemTags.includes(tag.id) ? '#28a745' : '#ccc',
                          backgroundColor: newItemTags.includes(tag.id) ? '#28a745' : 'transparent',
                        }}
                      >
                        <Text style={{ 
                          color: newItemTags.includes(tag.id) ? '#fff' : '#666',
                          fontWeight: newItemTags.includes(tag.id) ? 'bold' : 'normal'
                        }}>
                          {tag.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Allergènes (14 cases à cocher) */}
                  <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 12 }]}>Allergènes</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {ALLERGENS_LIST.map((allergen) => (
                      <TouchableOpacity 
                        key={allergen.id}
                        onPress={() => toggleAllergen(allergen.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          borderColor: newItemAllergens.includes(allergen.id) ? '#e74c3c' : '#ddd',
                          backgroundColor: newItemAllergens.includes(allergen.id) ? '#fef2f2' : '#f9f9f9',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 13,
                          color: newItemAllergens.includes(allergen.id) ? '#c0392b' : '#666',
                          fontWeight: newItemAllergens.includes(allergen.id) ? '600' : 'normal'
                        }}>
                          {allergen.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 20 }]} 
                    onPress={handleUpdateItem}
                    disabled={isLoading}
                  >
                    {isLoading ? <ActivityIndicator color={secondaryColor} /> : <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Enregistrer</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Modal: Add Note */}
      <Modal visible={showAddNote} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '95%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Nouvelle Note</Text>
                <TouchableOpacity onPress={() => setShowAddNote(false)}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Contenu de la note</Text>
                <TextInput 
                  style={[styles.modalInput, styles.modalInputMultiline, { borderColor: primaryColor }]} 
                  placeholder="Ex: Happy Hour -20% de 17h à 19h, Menu du jour à 12€..."
                  value={newNoteContent} 
                  onChangeText={setNewNoteContent}
                  multiline
                  numberOfLines={3}
                />
                
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: MENU_COLORS.note, marginTop: 16 }]} 
                  onPress={handleCreateNote}
                  disabled={isLoading}
                >
                  {isLoading ? <ActivityIndicator color="white" /> : <Text style={styles.modalSubmitButtonText}>Ajouter la note</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Modal Import CSV */}
      <Modal visible={showImportModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 500, width: '95%' }]}>
            <Text style={[styles.modalTitle, { color: primaryColor }]}>
              Importer depuis CSV
            </Text>
            <Text style={{ color: '#666', marginBottom: 8, fontSize: 13 }}>
              Format attendu (même colonnes que l'export Excel) :
            </Text>
            <Text style={{ color: '#888', marginBottom: 16, fontSize: 12, fontFamily: 'monospace' }}>
              Section;Sous-section;Produit;Description;Format;Prix;Prix HH;Tags;Allergènes;Statut
            </Text>
            <Text style={{ color: '#666', marginBottom: 16, fontSize: 12 }}>
              💡 Pour importer depuis Excel : ouvrez votre fichier .xlsx et enregistrez-le en CSV (délimiteur: point-virgule ;)
            </Text>
            
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
                onPress={() => setImportUpdateExisting(!importUpdateExisting)}
              >
                <View style={{ 
                  width: 24, height: 24, borderRadius: 4, borderWidth: 2, 
                  borderColor: primaryColor, marginRight: 10,
                  backgroundColor: importUpdateExisting ? primaryColor : 'transparent',
                  justifyContent: 'center', alignItems: 'center'
                }}>
                  {importUpdateExisting && <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>✓</Text>}
                </View>
                <Text style={{ color: primaryColor }}>Mettre à jour les produits existants</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => setImportClearExisting(!importClearExisting)}
              >
                <View style={{ 
                  width: 24, height: 24, borderRadius: 4, borderWidth: 2, 
                  borderColor: '#ff4444', marginRight: 10,
                  backgroundColor: importClearExisting ? '#ff4444' : 'transparent',
                  justifyContent: 'center', alignItems: 'center'
                }}>
                  {importClearExisting && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
                </View>
                <Text style={{ color: '#ff4444' }}>⚠️ Supprimer tout avant import</Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ backgroundColor: '#f0f0f0', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <input
                type="file"
                accept=".csv,.txt,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                id="csv-import-input"
              />
              <TouchableOpacity
                style={{ 
                  backgroundColor: '#FF9800', 
                  padding: 16, 
                  borderRadius: 8, 
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center'
                }}
                onPress={() => document.getElementById('csv-import-input')?.click()}
                disabled={isLoading}
              >
                <WebIcon name="cloud-upload-outline" size={24} color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                  {isLoading ? 'Import en cours...' : 'Sélectionner un fichier CSV'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {importStats && (
              <View style={{ backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ color: '#2e7d32', fontWeight: 'bold', marginBottom: 8 }}>Résultat de l'import :</Text>
                <Text style={{ color: '#2e7d32' }}>• {importStats.sections_created} sections créées</Text>
                <Text style={{ color: '#2e7d32' }}>• {importStats.items_created} items créés</Text>
                <Text style={{ color: '#2e7d32' }}>• {importStats.items_updated} items mis à jour</Text>
                {importStats.errors?.length > 0 && (
                  <Text style={{ color: '#ff4444', marginTop: 8 }}>
                    ⚠️ {importStats.errors.length} erreur(s)
                  </Text>
                )}
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: '#ccc' }]}
              onPress={() => { setShowImportModal(false); setImportStats(null); }}
            >
              <Text style={styles.modalButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* ========== MODAL: IMPORT PDF ========== */}
      <Modal visible={showImportPdfModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 600, width: '95%', maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryColor }]}>📄 Import depuis PDF</Text>
              <TouchableOpacity onPress={() => { setShowImportPdfModal(false); setPdfExtractedItems([]); setSelectedPdfItems([]); }}>
                <WebIcon name="close" size={28} color={primaryColor} />
              </TouchableOpacity>
            </View>
            
            {pdfExtractedItems.length === 0 ? (
              <View style={{ padding: 20 }}>
                <Text style={{ color: '#666', marginBottom: 16, fontSize: 14, textAlign: 'center' }}>
                  Importez un menu depuis un fichier PDF. Le système extraira automatiquement les sections, items et prix.
                </Text>
                
                <View style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                  <Text style={{ color: '#333', fontWeight: 'bold', marginBottom: 8 }}>📝 Formats supportés :</Text>
                  <Text style={{ color: '#666', fontSize: 13 }}>• PDFs avec texte sélectionnable</Text>
                  <Text style={{ color: '#666', fontSize: 13 }}>• Sections en majuscules (ex: "NOS ENTRÉES")</Text>
                  <Text style={{ color: '#666', fontSize: 13 }}>• Prix au format XX,XX€</Text>
                </View>
                
                <View style={{ backgroundColor: '#f0f0f0', padding: 16, borderRadius: 8 }}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={async (event: any) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      
                      setIsLoadingPdfImport(true);
                      
                      const reader = new FileReader();
                      reader.onload = async (e) => {
                        try {
                          const base64 = (e.target?.result as string).split(',')[1];
                          const response = await apiRequest(`${apiPrefix}/import-pdf`, {
                            method: 'POST',
                            body: JSON.stringify({
                              menu_type: currentTab,
                              pdf_base64: base64,
                              clear_existing: importClearExisting,
                              update_existing: importUpdateExisting
                            })
                          });
                          
                          if (response.preview && response.preview.length > 0) {
                            setPdfExtractedItems(response.preview);
                            setSelectedPdfItems(response.preview.map((p: any) => p.name));
                            showAlert('Succès', response.message);
                          } else {
                            showAlert('Attention', response.message || 'Aucun item extrait');
                          }
                        } catch (error: any) {
                          showAlert('Erreur', error.message || 'Erreur lors de l\'analyse du PDF');
                        }
                        setIsLoadingPdfImport(false);
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ display: 'none' }}
                    id="pdf-import-input"
                  />
                  <TouchableOpacity
                    style={{ 
                      backgroundColor: '#9C27B0', 
                      padding: 16, 
                      borderRadius: 8, 
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center'
                    }}
                    onPress={() => document.getElementById('pdf-import-input')?.click()}
                    disabled={isLoadingPdfImport}
                    data-testid="select-pdf-file-btn"
                  >
                    <WebIcon name="document-attach-outline" size={24} color="white" style={{ marginRight: 8 }} />
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                      {isLoadingPdfImport ? 'Analyse en cours...' : 'Sélectionner un fichier PDF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView style={{ flex: 1, maxHeight: 500 }}>
                {/* Selection controls */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ color: primaryColor, fontWeight: 'bold' }}>
                    {selectedPdfItems.length} / {pdfExtractedItems.length} sélectionné(s)
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity onPress={() => setSelectedPdfItems(pdfExtractedItems.map(p => p.name))}>
                      <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>Tout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSelectedPdfItems([])}>
                      <Text style={{ color: '#F44336', fontWeight: 'bold' }}>Aucun</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Group by section */}
                {(() => {
                  const grouped: { [key: string]: any[] } = {};
                  pdfExtractedItems.forEach(item => {
                    const section = item.section || 'Sans Section';
                    if (!grouped[section]) grouped[section] = [];
                    grouped[section].push(item);
                  });
                  
                  return Object.entries(grouped).map(([sectionName, sectionItems]) => (
                    <View key={sectionName} style={{ marginBottom: 12 }}>
                      <View style={{ backgroundColor: currentTab === 'food' ? '#2E7D32' : '#1565C0', padding: 10, marginHorizontal: 8, borderRadius: 6, marginTop: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{sectionName}</Text>
                      </View>
                      {sectionItems.map((item: any, idx: number) => (
                        <TouchableOpacity
                          key={`${sectionName}-${idx}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 12,
                            marginHorizontal: 8,
                            backgroundColor: selectedPdfItems.includes(item.name) ? '#E8F5E9' : '#fff',
                            borderBottomWidth: 1,
                            borderBottomColor: '#f0f0f0'
                          }}
                          onPress={() => {
                            if (selectedPdfItems.includes(item.name)) {
                              setSelectedPdfItems(prev => prev.filter(n => n !== item.name));
                            } else {
                              setSelectedPdfItems(prev => [...prev, item.name]);
                            }
                          }}
                        >
                          <View style={{ 
                            width: 22, height: 22, borderRadius: 4, 
                            borderWidth: 2, borderColor: selectedPdfItems.includes(item.name) ? '#4CAF50' : '#ccc',
                            backgroundColor: selectedPdfItems.includes(item.name) ? '#4CAF50' : '#fff',
                            justifyContent: 'center', alignItems: 'center', marginRight: 10
                          }}>
                            {selectedPdfItems.includes(item.name) && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '600', color: '#333' }}>{item.name}</Text>
                            {item.description && <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>{item.description}</Text>}
                          </View>
                          {item.price && (
                            <Text style={{ fontWeight: 'bold', color: '#4CAF50' }}>{item.price.toFixed(2)}€</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ));
                })()}
              </ScrollView>
            )}
            
            {/* Action buttons */}
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              {pdfExtractedItems.length > 0 && (
                <TouchableOpacity
                  style={{
                    backgroundColor: selectedPdfItems.length > 0 ? '#4CAF50' : '#ccc',
                    padding: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                    marginBottom: 10
                  }}
                  disabled={selectedPdfItems.length === 0 || isLoadingPdfImport}
                  onPress={async () => {
                    setIsLoadingPdfImport(true);
                    try {
                      const itemsToImport = pdfExtractedItems.filter(p => selectedPdfItems.includes(p.name));
                      const response = await apiRequest(`${apiPrefix}/import-pdf/confirm`, {
                        method: 'POST',
                        body: JSON.stringify({
                          items: itemsToImport,
                          menu_type: currentTab,
                          clear_existing: importClearExisting
                        })
                      });
                      
                      showAlert('Succès', response.message);
                      await loadSections(currentTab);
                      await loadItems(currentTab);
                      setShowImportPdfModal(false);
                      setPdfExtractedItems([]);
                      setSelectedPdfItems([]);
                    } catch (error: any) {
                      showAlert('Erreur', error.message || 'Erreur lors de l\'import');
                    }
                    setIsLoadingPdfImport(false);
                  }}
                  data-testid="confirm-pdf-import-btn"
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                    {isLoadingPdfImport ? 'Import en cours...' : `Importer ${selectedPdfItems.length} item(s)`}
                  </Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#ccc' }]}
                onPress={() => { setShowImportPdfModal(false); setPdfExtractedItems([]); setSelectedPdfItems([]); }}
              >
                <Text style={styles.modalButtonText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* ========== MODAL: EDIT ARDOISE ========== */}
      <Modal visible={showArdoiseModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ScrollView style={{ maxHeight: '90%', width: '95%', maxWidth: 500 }} contentContainerStyle={{ padding: 0 }}>
              <View style={[styles.modalContent, { backgroundColor: '#2d3436', padding: 20 }]}>
                <View style={[styles.modalHeader, { borderBottomColor: '#555' }]}>
                  <Text style={[styles.modalTitle, { color: '#ffd166' }]}>Modifier l'Ardoise</Text>
                  <TouchableOpacity onPress={() => setShowArdoiseModal(false)}>
                    <WebIcon name="close" size={28} color="#fff" />
                  </TouchableOpacity>
                </View>
                
                {editingArdoise && (
                  <View>
                    {/* Section ENTRÉE */}
                    <Text style={{ color: '#ffd166', fontSize: 16, fontWeight: 'bold', marginTop: 16, marginBottom: 8 }}>ENTRÉE</Text>
                    {editingArdoise.entree.map((item: any, idx: number) => (
                      <View key={`edit-entree-${idx}`} style={{ marginBottom: 12, padding: 12, backgroundColor: '#3d4849', borderRadius: 8 }}>
                        <Text style={{ color: '#ffd166', marginBottom: 4, fontSize: 12 }}>Entrée {idx + 1}</Text>
                        <TextInput
                          style={{ backgroundColor: '#2d3436', color: 'white', borderColor: '#ffd166', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 16 }}
                          placeholder="Nom du plat"
                          placeholderTextColor="#888"
                          value={item.name}
                          onChangeText={(text) => updateArdoiseItem('entree', idx, 'name', text)}
                        />
                        <TextInput
                          style={{ backgroundColor: '#2d3436', color: 'white', borderColor: '#555', borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 }}
                          placeholder="Description (optionnel)"
                          placeholderTextColor="#888"
                          value={item.description}
                          onChangeText={(text) => updateArdoiseItem('entree', idx, 'description', text)}
                        />
                      </View>
                    ))}
                    
                    {/* Section PLAT */}
                    <Text style={{ color: '#ffd166', fontSize: 16, fontWeight: 'bold', marginTop: 16, marginBottom: 8 }}>PLAT</Text>
                    {editingArdoise.plat.map((item: any, idx: number) => (
                      <View key={`edit-plat-${idx}`} style={{ marginBottom: 12, padding: 12, backgroundColor: '#3d4849', borderRadius: 8 }}>
                        <Text style={{ color: '#ffd166', marginBottom: 4, fontSize: 12 }}>Plat {idx + 1}</Text>
                        <TextInput
                          style={{ backgroundColor: '#2d3436', color: 'white', borderColor: '#ffd166', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 16 }}
                          placeholder="Nom du plat"
                          placeholderTextColor="#888"
                          value={item.name}
                          onChangeText={(text) => updateArdoiseItem('plat', idx, 'name', text)}
                        />
                        <TextInput
                          style={{ backgroundColor: '#2d3436', color: 'white', borderColor: '#555', borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 }}
                          placeholder="Description (optionnel)"
                          placeholderTextColor="#888"
                          value={item.description}
                          onChangeText={(text) => updateArdoiseItem('plat', idx, 'description', text)}
                        />
                      </View>
                    ))}
                    
                    {/* Section DESSERT */}
                    <Text style={{ color: '#ffd166', fontSize: 16, fontWeight: 'bold', marginTop: 16, marginBottom: 8 }}>DESSERT</Text>
                    {editingArdoise.dessert.map((item: any, idx: number) => (
                      <View key={`edit-dessert-${idx}`} style={{ marginBottom: 12, padding: 12, backgroundColor: '#3d4849', borderRadius: 8 }}>
                        <Text style={{ color: '#ffd166', marginBottom: 4, fontSize: 12 }}>Dessert {idx + 1}</Text>
                        <TextInput
                          style={{ backgroundColor: '#2d3436', color: 'white', borderColor: '#ffd166', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 16 }}
                          placeholder="Nom du dessert"
                          placeholderTextColor="#888"
                          value={item.name}
                          onChangeText={(text) => updateArdoiseItem('dessert', idx, 'name', text)}
                        />
                        <TextInput
                          style={{ backgroundColor: '#2d3436', color: 'white', borderColor: '#555', borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 }}
                          placeholder="Description (optionnel)"
                          placeholderTextColor="#888"
                          value={item.description}
                          onChangeText={(text) => updateArdoiseItem('dessert', idx, 'description', text)}
                        />
                      </View>
                    ))}
                    
                    {/* Boutons d'action */}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                      <TouchableOpacity
                        style={[styles.modalButton, { flex: 1, backgroundColor: '#666' }]}
                        onPress={() => setShowArdoiseModal(false)}
                      >
                        <Text style={[styles.modalButtonText, { color: 'white' }]}>Annuler</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, { flex: 1, backgroundColor: '#ffd166' }]}
                        onPress={saveArdoise}
                      >
                        <Text style={[styles.modalButtonText, { color: '#2d3436' }]}>Enregistrer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ========== MODAL: PDF PREVIEW ========== */}
      <Modal visible={showPdfPreview} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: 'white', padding: 0, width: '95%', maxWidth: 900, height: '90%', borderRadius: 12, overflow: 'hidden' }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1A1A2E', borderBottomWidth: 1, borderBottomColor: '#333' }}>
              <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                Aperçu PDF - Carte {pdfPreviewType === 'food' ? 'Food' : 'Boisson'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  onPress={handleDownloadFromPreview}
                  style={{ backgroundColor: '#2E7D32', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                  data-testid="download-from-preview-btn"
                >
                  <WebIcon name="download-outline" size={20} color="white" />
                  <Text style={{ color: 'white', fontWeight: '600', marginLeft: 8 }}>Télécharger</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={closePdfPreview}
                  style={{ backgroundColor: '#666', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                  data-testid="close-preview-btn"
                >
                  <WebIcon name="close" size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>
            {/* PDF Viewer */}
            <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
              {pdfPreviewUrl && (
                <iframe
                  src={pdfPreviewUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="PDF Preview"
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    
    {/* Bouton flottant "Ajouter section" en bas */}
    {canAddSection && (
      <TouchableOpacity 
        style={{
          position: 'absolute',
          bottom: Platform.OS === 'web' ? 50 : 20,
          right: 16,
          backgroundColor: currentTab === 'food' ? MENU_COLORS.sectionFood : MENU_COLORS.sectionBoisson,
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderRadius: 30,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 8,
          zIndex: 1000
        }}
        onPress={() => { resetSectionForm(); setNewSectionParentId(null); setShowAddSection(true); }}
        data-testid="floating-add-section-btn"
      >
        <WebIcon name="add-circle-outline" size={24} color="white" />
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Ajouter section</Text>
      </TouchableOpacity>
    )}
    </View>
  );
}

// Styles spécifiques pour Menu Restaurant
const menuRestaurantStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  backText: { fontSize: 16, marginLeft: 4 },
  screenTitle: { fontSize: 22, fontWeight: 'bold' },
  
  // Dropdown styles (replacing tabs)
  dropdownButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    padding: 14, 
    borderRadius: 10 
  },
  dropdownButtonText: { fontSize: 18, fontWeight: '600', color: 'white' },
  dropdownMenu: { 
    position: 'absolute', 
    top: '100%', 
    left: 0, 
    right: 0, 
    backgroundColor: 'white', 
    borderRadius: 10, 
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5
  },
  dropdownItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    padding: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#EEE' 
  },
  dropdownItemActive: { backgroundColor: '#F5F5F5' },
  dropdownItemText: { fontSize: 16, color: '#333' },
  
  // Choice modal styles
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 10,
    gap: 12
  },
  choiceButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  
  // Old tab styles (kept for compatibility)
  tabContainer: { flexDirection: 'row', marginBottom: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E0E0E0' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 16, fontWeight: '600', color: '#333' },
  
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  addButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  addButtonText: { color: 'white', fontWeight: '600', fontSize: 15 },
  
  // ========== ARDOISE STYLES ==========
  ardoiseContainer: {
    backgroundColor: '#2d3436',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16
  },
  ardoiseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8
  },
  ardoiseTitle: {
    color: '#ffd166',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1
  },
  ardoiseActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6
  },
  ardoiseSection: {
    marginBottom: 12
  },
  ardoiseSectionTitle: {
    color: '#ffd166',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,209,102,0.3)',
    paddingBottom: 4
  },
  ardoiseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  ardoiseItemName: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500'
  },
  ardoiseItemDesc: {
    color: '#b2bec3',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2
  },
  ardoiseItemPrice: {
    color: '#ffd166',
    fontSize: 15,
    fontWeight: '600'
  },
  ardoiseHint: {
    color: '#636e72',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12
  },
  
  menuContent: { marginBottom: 20 },
  
  sectionHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    padding: 14, 
    borderRadius: 10, 
    marginBottom: 8 
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  sectionActionBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  
  happyHourBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4, alignSelf: 'flex-start' },
  happyHourBadgeText: { fontSize: 11, color: 'white', fontWeight: '600' },
  
  itemContainer: { 
    backgroundColor: 'white', 
    padding: 12, 
    marginBottom: 6, 
    borderRadius: 8, 
    marginLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#DDD'
  },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start' },
  itemName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  itemDesc: { fontSize: 14, lineHeight: 18 },
  itemPrice: { fontSize: 16, fontWeight: 'bold' },
  itemActionBtn: { padding: 6, backgroundColor: '#F5F5F5', borderRadius: 6 },
  
  formatName: { fontSize: 12, color: '#888' },
  happyHourPrice: { fontSize: 12, fontStyle: 'italic' },
  
  // Happy Hour Table Styles
  happyHourTable: {
    marginTop: 12,
    marginLeft: 16,
    backgroundColor: '#FFF5EB',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF6B35'
  },
  happyHourTableHeader: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  happyHourTableTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14
  },
  happyHourTableBody: {
    padding: 12
  },
  happyHourTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FFD5C0'
  },
  happyHourItemName: {
    fontSize: 13,
    color: '#333',
    flex: 1
  },
  happyHourPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  happyHourOriginalPrice: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through'
  },
  happyHourNewPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF6B35'
  },
  
  suggestionContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEE' },
  suggestionText: { fontSize: 13, fontWeight: '500', fontStyle: 'italic' },
  
  supplementContainer: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  supplementLabel: { fontSize: 12, fontWeight: '600' },
  supplementText: { fontSize: 12 },
  
  notesSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 2, borderTopColor: '#DDD' },
  notesSectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  noteContainer: { 
    backgroundColor: '#FFF9F0', 
    padding: 12, 
    borderRadius: 8, 
    marginBottom: 8,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center'
  },
  noteText: { flex: 1, fontSize: 14, fontWeight: '500' },
  noteDeleteBtn: { padding: 4 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#999', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#BBB' },
  
  parentOption: { 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#E8E8E8',
    marginRight: 8 
  },
  parentOptionSelected: { backgroundColor: '#333' },
  parentOptionText: { fontSize: 14, color: '#333' },
  
  happyHourToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  checkbox: { 
    width: 24, 
    height: 24, 
    borderRadius: 6, 
    borderWidth: 2, 
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  formatInput: { 
    borderWidth: 1, 
    borderColor: '#CCC', 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: 'white'
  },
  
  addRowButton: { 
    borderWidth: 1, 
    borderColor: '#999', 
    borderStyle: 'dashed', 
    borderRadius: 8, 
    paddingVertical: 10, 
    alignItems: 'center',
    marginTop: 4
  },
  addRowButtonText: { fontSize: 14, color: '#666' },
  
  // Export buttons
  exportRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  exportButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13
  },
  
  ficheSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8
  },
  ficheSearchContainer: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12
  },
  ficheSearchInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: 'white'
  },
  ficheSearchItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  }
});

// ==================== MENU RESTAURANT DRAFT SCREEN ====================
function MenuRestaurantDraftScreen({ 
  sections, items, primaryColor, secondaryColor, apiRequest, 
  loadSections, loadItems, publishDraft, initializeDraft, 
  setIsDraftModified, isDraftModified, showAlert 
}: any) {
  const [currentTab, setCurrentTab] = useState<'food' | 'boisson'>('food');
  const [isLoading, setIsLoading] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  
  // Section form state
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionParentId, setNewSectionParentId] = useState<string | null>(null);
  
  // Item form state
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  
  // Filter sections by menu type
  const foodSections = sections.filter((s: any) => s.menu_type === 'food');
  const boissonSections = sections.filter((s: any) => s.menu_type === 'boisson');
  const currentSections = currentTab === 'food' ? foodSections : boissonSections;
  
  // Get items for a section
  const getItemsForSection = (sectionId: string) => {
    return items.filter((item: any) => item.section_id === sectionId);
  };
  
  // Add section
  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    setIsLoading(true);
    try {
      await apiRequest('/menu-restaurant-draft/sections', {
        method: 'POST',
        body: JSON.stringify({
          name: newSectionName,
          menu_type: currentTab,
          parent_id: newSectionParentId
        })
      });
      setNewSectionName('');
      setNewSectionParentId(null);
      setShowAddSection(false);
      loadSections();
      setIsDraftModified(true);
    } catch (error) {
      console.error('Error adding section:', error);
    }
    setIsLoading(false);
  };
  
  // Add item
  const handleAddItem = async () => {
    if (!newItemName.trim() || !selectedSection) return;
    setIsLoading(true);
    try {
      await apiRequest('/menu-restaurant-draft/items', {
        method: 'POST',
        body: JSON.stringify({
          name: newItemName,
          description: newItemDescription,
          price: parseFloat(newItemPrice) || 0,
          section_id: selectedSection.section_id,
          menu_type: currentTab
        })
      });
      setNewItemName('');
      setNewItemPrice('');
      setNewItemDescription('');
      setShowAddItem(false);
      loadItems();
      setIsDraftModified(true);
    } catch (error) {
      console.error('Error adding item:', error);
    }
    setIsLoading(false);
  };
  
  // Delete section
  const handleDeleteSection = async (sectionId: string) => {
    try {
      await apiRequest(`/menu-restaurant-draft/sections/${sectionId}`, { method: 'DELETE' });
      loadSections();
      loadItems();
      setIsDraftModified(true);
    } catch (error) {
      console.error('Error deleting section:', error);
    }
  };
  
  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    try {
      await apiRequest(`/menu-restaurant-draft/items/${itemId}`, { method: 'DELETE' });
      loadItems();
      setIsDraftModified(true);
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };
  
  // Publish to main menu
  const handlePublish = async () => {
    setIsLoading(true);
    await publishDraft();
    setShowPublishConfirm(false);
    setIsLoading(false);
  };
  
  // Initialize from main menu
  const handleInitialize = async () => {
    setIsLoading(true);
    await initializeDraft();
    setIsLoading(false);
  };
  
  return (
    <ScrollView style={{ flex: 1, backgroundColor: secondaryColor }}>
      <View style={{ padding: 16 }}>
        {/* Header with title */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>✏️ Menu en cours</Text>
          {isDraftModified && (
            <View style={{ backgroundColor: '#FFA500', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Modifié</Text>
            </View>
          )}
        </View>
        
        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: '#4CAF50', padding: 14, borderRadius: 10, alignItems: 'center' }}
            onPress={() => setShowPublishConfirm(true)}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>📤 Publier les modifications</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: '#2196F3', padding: 14, borderRadius: 10, alignItems: 'center' }}
            onPress={handleInitialize}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>🔄 Réinitialiser</Text>
          </TouchableOpacity>
        </View>
        
        {/* Tabs */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: currentTab === 'food' ? primaryColor : '#eee', alignItems: 'center' }}
            onPress={() => setCurrentTab('food')}
          >
            <Text style={{ fontWeight: '600', color: currentTab === 'food' ? secondaryColor : '#666' }}>🍽️ Carte Food</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: currentTab === 'boisson' ? primaryColor : '#eee', alignItems: 'center' }}
            onPress={() => setCurrentTab('boisson')}
          >
            <Text style={{ fontWeight: '600', color: currentTab === 'boisson' ? secondaryColor : '#666' }}>🍷 Carte Boisson</Text>
          </TouchableOpacity>
        </View>
        
        {/* Add section button */}
        <TouchableOpacity 
          style={{ backgroundColor: primaryColor, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 16 }}
          onPress={() => setShowAddSection(true)}
        >
          <Text style={{ color: secondaryColor, fontWeight: '600' }}>+ Ajouter une section</Text>
        </TouchableOpacity>
        
        {/* Sections list */}
        {currentSections.filter((s: any) => !s.parent_id).map((section: any) => (
          <View key={section.section_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>{section.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity 
                  style={{ backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                  onPress={() => { setSelectedSection(section); setShowAddItem(true); }}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>+ Plat</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ backgroundColor: '#f44336', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                  onPress={() => handleDeleteSection(section.section_id)}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Items in this section */}
            {getItemsForSection(section.section_id).map((item: any) => (
              <View key={item.item_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eee' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '500', color: '#333' }}>{item.name}</Text>
                  {item.description && <Text style={{ fontSize: 12, color: '#666' }}>{item.description}</Text>}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontWeight: '600', color: primaryColor }}>{item.price?.toFixed(2)}€</Text>
                  <TouchableOpacity onPress={() => handleDeleteItem(item.item_id)}>
                    <Text style={{ color: '#f44336' }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            
            {/* Sub-sections */}
            {currentSections.filter((s: any) => s.parent_id === section.section_id).map((subSection: any) => (
              <View key={subSection.section_id} style={{ marginTop: 12, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: primaryColor }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#555' }}>{subSection.name}</Text>
                  <TouchableOpacity onPress={() => handleDeleteSection(subSection.section_id)}>
                    <Text style={{ color: '#f44336' }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
                {getItemsForSection(subSection.section_id).map((item: any) => (
                  <View key={item.item_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ color: '#333' }}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: primaryColor }}>{item.price?.toFixed(2)}€</Text>
                      <TouchableOpacity onPress={() => handleDeleteItem(item.item_id)}>
                        <Text style={{ color: '#f44336', fontSize: 12 }}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
        
        {currentSections.length === 0 && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: '#999' }}>Aucune section</Text>
            <Text style={{ fontSize: 14, color: '#999', marginTop: 8 }}>Cliquez sur "Réinitialiser" pour copier le menu actuel</Text>
          </View>
        )}
      </View>
      
      {/* Add Section Modal */}
      <Modal visible={showAddSection} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: primaryColor }}>Nouvelle section</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}
              placeholder="Nom de la section"
              value={newSectionName}
              onChangeText={setNewSectionName}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center' }}
                onPress={() => setShowAddSection(false)}
              >
                <Text>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: primaryColor, alignItems: 'center' }}
                onPress={handleAddSection}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Add Item Modal */}
      <Modal visible={showAddItem} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: primaryColor }}>Nouveau plat</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}
              placeholder="Nom du plat"
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}
              placeholder="Description (optionnel)"
              value={newItemDescription}
              onChangeText={setNewItemDescription}
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}
              placeholder="Prix (€)"
              value={newItemPrice}
              onChangeText={setNewItemPrice}
              keyboardType="numeric"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center' }}
                onPress={() => setShowAddItem(false)}
              >
                <Text>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: primaryColor, alignItems: 'center' }}
                onPress={handleAddItem}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Publish Confirmation Modal */}
      <Modal visible={showPublishConfirm} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: primaryColor }}>📤 Publier les modifications</Text>
            <Text style={{ color: '#666', marginBottom: 20, lineHeight: 22 }}>
              Cette action va remplacer le Menu Restaurant actuel et mettre à jour le Menu Client visible par vos clients.
              {'\n\n'}Voulez-vous continuer ?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center' }}
                onPress={() => setShowPublishConfirm(false)}
              >
                <Text>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#4CAF50', alignItems: 'center' }}
                onPress={handlePublish}
                disabled={isLoading}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{isLoading ? '⏳...' : '✅ Publier'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ==================== HELPER FUNCTIONS ====================
function getTodayDate(): string { return new Date().toISOString().split('T')[0]; }
function getTomorrowDate(): string { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function addDays(dateStr: string, days: number): string { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; }
function formatDate(dateStr: string): string { return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }

// ==================== RAPPORT ARDOISE SCREEN ====================
function RapportArdoiseScreen({ 
  ardoiseData, ardoiseReport, ardoiseReportPeriod, setArdoiseReportPeriod,
  primaryColor, secondaryColor, apiRequest, loadArdoiseData, loadArdoiseReport,
  saveArdoiseSales, updateArdoise, restaurant, showAlert, ardoisePermissions, onBack
}: any) {
  // Permissions avec valeurs par défaut (admin a tout)
  const perms = ardoisePermissions || {
    actif: true,
    edition: { acces: true, mode: 'modifier' },
    ventes: { acces: true, mode: 'modifier' },
    rapports: { acces: true, mode: 'modifier', export_pdf: true, export_excel: true }
  };
  
  // Déterminer l'onglet initial en fonction des permissions
  const getInitialTab = () => {
    if (perms.edition?.acces) return 'edit';
    if (perms.ventes?.acces) return 'sales';
    if (perms.rapports?.acces) return 'report';
    return 'edit';
  };
  
  const [activeTab, setActiveTab] = useState<'edit' | 'sales' | 'report'>(getInitialTab());
  const [isLoading, setIsLoading] = useState(false);
  const [salesDate, setSalesDate] = useState(new Date().toISOString().split('T')[0]);
  const [salesService, setSalesService] = useState<'midi' | 'soir'>('midi');
  
  // État pour la planification de l'ardoise
  const [editDate, setEditDate] = useState(new Date().toISOString().split('T')[0]);
  const [plannedDates, setPlannedDates] = useState<any[]>([]);
  const [isLoadingPlanned, setIsLoadingPlanned] = useState(false);
  
  // Auto-complétion state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<{category: string, index: number} | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);
  
  // Local state for editing
  const [editEntree, setEditEntree] = useState<any[]>([]);
  const [editPlat, setEditPlat] = useState<any[]>([]);
  const [editDessert, setEditDessert] = useState<any[]>([]);
  const [editFormulePrices, setEditFormulePrices] = useState<any>({});
  
  // Local state for sales input
  const [salesEntree, setSalesEntree] = useState<any[]>([]);
  const [salesPlat, setSalesPlat] = useState<any[]>([]);
  const [salesDessert, setSalesDessert] = useState<any[]>([]);
  
  // Charger la liste des dates planifiées
  const loadPlannedDates = async () => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const restId = restaurant?.restaurant_id || restaurant?.id;
      const response = await fetch(`${baseUrl}/api/ardoise/planned/list/${restId}`);
      if (response.ok) {
        const data = await response.json();
        setPlannedDates(data.dates || []);
      }
    } catch (error) {
      console.error('Error loading planned dates:', error);
    }
  };
  
  // Charger l'ardoise pour une date spécifique
  const loadPlannedArdoise = async (date: string) => {
    setIsLoadingPlanned(true);
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const restId = restaurant?.restaurant_id || restaurant?.id;
      const response = await fetch(`${baseUrl}/api/ardoise/planned/${restId}?date=${date}`);
      if (response.ok) {
        const data = await response.json();
        
        // Si c'est un jour futur sans planification, afficher des champs vides MAIS garder les prix
        const today = new Date().toISOString().split('T')[0];
        const isFuture = date > today;
        const isEmpty = !data.found && !data.is_current;
        
        if (isFuture && isEmpty) {
          // Jour futur sans planification = champs vides MAIS prix conservés
          setEditEntree([{name: '', description: ''}, {name: '', description: ''}]);
          setEditPlat([{name: '', description: ''}, {name: '', description: ''}]);
          setEditDessert([{name: '', description: ''}, {name: '', description: ''}]);
          // GARDER LES PRIX de l'API
          setEditFormulePrices(data.formule_prices || {});
        } else {
          // Jour actuel ou planification existante
          setEditEntree(data.entree?.length ? data.entree : [{name: '', description: ''}, {name: '', description: ''}]);
          setEditPlat(data.plat?.length ? data.plat : [{name: '', description: ''}, {name: '', description: ''}]);
          setEditDessert(data.dessert?.length ? data.dessert : [{name: '', description: ''}, {name: '', description: ''}]);
          setEditFormulePrices(data.formule_prices || {});
        }
      }
    } catch (error) {
      console.error('Error loading planned ardoise:', error);
    } finally {
      setIsLoadingPlanned(false);
    }
  };
  
  // Sauvegarder l'ardoise planifiée
  const savePlannedArdoise = async () => {
    setIsLoading(true);
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const restId = restaurant?.restaurant_id || restaurant?.id;
      const response = await fetch(`${baseUrl}/api/ardoise/planned/${restId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          entree: editEntree.filter(e => e.name),
          plat: editPlat.filter(p => p.name),
          dessert: editDessert.filter(d => d.name),
          formule_prices: editFormulePrices
        })
      });
      if (response.ok) {
        showAlert('Succès', `Ardoise du ${new Date(editDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} sauvegardée !`);
        loadPlannedDates(); // Rafraîchir la liste
      } else {
        showAlert('Erreur', 'Impossible de sauvegarder');
      }
    } catch (error) {
      showAlert('Erreur', 'Erreur de connexion');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Charger les dates planifiées au montage et quand on change de date
  useEffect(() => {
    if (activeTab === 'edit') {
      loadPlannedDates();
      loadPlannedArdoise(editDate);
    }
  }, [activeTab, editDate]);
  
  // Fonction de recherche de suggestions
  const searchSuggestions = async (query: string, category: string, index: number) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(null);
      return;
    }
    
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const restId = restaurant?.restaurant_id || restaurant?.id;
      console.log('Searching suggestions:', { query, category, restId, baseUrl });
      
      const url = `${baseUrl}/api/ardoise/suggestions/${restId}?query=${encodeURIComponent(query)}&category=${category}`;
      console.log('Fetching:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Suggestions received:', data.suggestions?.length || 0);
        setSuggestions(data.suggestions || []);
        setShowSuggestions({category, index});
      } else {
        console.error('API error:', response.status);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };
  
  // Debounce search
  const handleInputChange = (text: string, category: string, index: number, setFunc: any, currentArray: any[]) => {
    const updated = [...currentArray];
    updated[index] = {...updated[index], name: text};
    setFunc(updated);
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for search
    const timeout = setTimeout(() => {
      searchSuggestions(text, category, index);
    }, 300);
    setSearchTimeout(timeout);
  };
  
  // Sélectionner une suggestion
  const selectSuggestion = (suggestion: any, category: string, index: number) => {
    if (category === 'entree') {
      const updated = [...editEntree];
      updated[index] = {...updated[index], name: suggestion.name};
      setEditEntree(updated);
    } else if (category === 'plat') {
      const updated = [...editPlat];
      updated[index] = {...updated[index], name: suggestion.name};
      setEditPlat(updated);
    } else if (category === 'dessert') {
      const updated = [...editDessert];
      updated[index] = {...updated[index], name: suggestion.name};
      setEditDessert(updated);
    }
    setSuggestions([]);
    setShowSuggestions(null);
  };
  
  useEffect(() => {
    if (ardoiseData) {
      setEditEntree(ardoiseData.entree || [{name: '', description: ''}, {name: '', description: ''}]);
      setEditPlat(ardoiseData.plat || [{name: '', description: ''}, {name: '', description: ''}]);
      setEditDessert(ardoiseData.dessert || [{name: '', description: ''}, {name: '', description: ''}]);
      setEditFormulePrices(ardoiseData.formule_prices || {plat_du_jour: 0, entree_plat: 0, plat_dessert: 0, entree_plat_dessert: 0});
      // Initialize sales quantities
      setSalesEntree((ardoiseData.entree || []).map((e: any) => ({...e, quantity_sold: 0})));
      setSalesPlat((ardoiseData.plat || []).map((p: any) => ({...p, quantity_sold: 0})));
      setSalesDessert((ardoiseData.dessert || []).map((d: any) => ({...d, quantity_sold: 0})));
    }
  }, [ardoiseData]);
  
  useEffect(() => {
    if (activeTab === 'report') {
      loadArdoiseReport();
    }
  }, [activeTab, ardoiseReportPeriod]);
  
  const handleSaveArdoise = async () => {
    // Utiliser la nouvelle fonction de sauvegarde planifiée
    await savePlannedArdoise();
  };
  
  const handleSaveSales = async () => {
    const totalQty = [...salesEntree, ...salesPlat, ...salesDessert].reduce((sum, item) => sum + (item.quantity_sold || 0), 0);
    if (totalQty === 0) {
      showAlert('Attention', 'Saisissez au moins une quantité');
      return;
    }
    
    setIsLoading(true);
    try {
      await saveArdoiseSales({
        date: salesDate,
        service: salesService,
        entree: salesEntree,
        plat: salesPlat,
        dessert: salesDessert,
        formule_prices: editFormulePrices
      });
      // Reset quantities
      setSalesEntree(salesEntree.map((e: any) => ({...e, quantity_sold: 0})));
      setSalesPlat(salesPlat.map((p: any) => ({...p, quantity_sold: 0})));
      setSalesDessert(salesDessert.map((d: any) => ({...d, quantity_sold: 0})));
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleExportPDF = async () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const restId = restaurant?.restaurant_id || restaurant?.id;
    const url = `${baseUrl}/api/ardoise/sales/export-pdf/by-restaurant/${restId}?period=${ardoiseReportPeriod}`;
    
    // Pour iOS, utiliser le Web Share API si disponible
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], `rapport_ventes_${ardoiseReportPeriod}.pdf`, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: 'Rapport des ventes',
        });
        return;
      } catch (error) {
        console.log('Share failed, opening URL directly');
      }
    }
    
    // Fallback: ouvrir directement
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };
  
  const handleExportExcel = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const restId = restaurant?.restaurant_id || restaurant?.id;
    const url = `${baseUrl}/api/ardoise/sales/export-excel/by-restaurant/${restId}?period=${ardoiseReportPeriod}`;
    
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  };
  
  // Export planning PDF
  const handleExportPlanningPDF = async () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const restId = restaurant?.restaurant_id || restaurant?.id;
    const url = `${baseUrl}/api/ardoise/planned/export-pdf/${restId}?days=10`;
    
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], 'planning_ardoise.pdf', { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: 'Planning Ardoise',
        });
        return;
      } catch (error) {
        console.log('Share failed, opening URL directly');
      }
    }
    
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };
  
  // Export planning Excel
  const handleExportPlanningExcel = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const restId = restaurant?.restaurant_id || restaurant?.id;
    const url = `${baseUrl}/api/ardoise/planned/export-excel/${restId}?days=10`;
    
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  };
  
  // Charger les ventes existantes pour une date donnée
  const loadExistingSales = async (date: string, service: string) => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await fetch(`${baseUrl}/api/ardoise/sales/by-date/${restaurant.restaurant_id}?date=${date}&service=${service}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.sales && data.sales.length > 0) {
          const saleData = data.sales[0];
          // Mettre à jour les quantités avec les données existantes
          setSalesEntree(prev => prev.map((item: any) => {
            const found = saleData.entree?.find((e: any) => e.name === item.name);
            return {...item, quantity_sold: found?.quantity_sold || 0};
          }));
          setSalesPlat(prev => prev.map((item: any) => {
            const found = saleData.plat?.find((p: any) => p.name === item.name);
            return {...item, quantity_sold: found?.quantity_sold || 0};
          }));
          setSalesDessert(prev => prev.map((item: any) => {
            const found = saleData.dessert?.find((d: any) => d.name === item.name);
            return {...item, quantity_sold: found?.quantity_sold || 0};
          }));
          return;
        }
      }
      // Si pas de données, remettre à zéro
      setSalesEntree(prev => prev.map((e: any) => ({...e, quantity_sold: 0})));
      setSalesPlat(prev => prev.map((p: any) => ({...p, quantity_sold: 0})));
      setSalesDessert(prev => prev.map((d: any) => ({...d, quantity_sold: 0})));
    } catch (error) {
      console.error('Error loading existing sales:', error);
    }
  };
  
  // Charger les ventes quand la date ou le service change
  useEffect(() => {
    if (activeTab === 'sales' && salesDate && salesService) {
      loadExistingSales(salesDate, salesService);
    }
  }, [salesDate, salesService, activeTab]);
  
  const periodLabels: any = { week: 'Cette semaine', month: 'Ce mois', year: 'Cette année' };
  
  return (
    <ScrollView style={{ flex: 1, backgroundColor: secondaryColor }} contentContainerStyle={{ paddingBottom: 0 }}>
      <View style={{ padding: 12, paddingTop: 4, paddingBottom: 4 }}>
        {/* Header avec bouton retour */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <TouchableOpacity 
            onPress={onBack} 
            style={{ padding: 8, marginRight: 12, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: primaryColor }}
            data-testid="rapport-ardoise-back-btn"
          >
            <Text style={{ fontSize: 18, color: primaryColor, fontWeight: 'bold' }}>← Retour</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, flex: 1 }}>{restaurant?.name || 'Restaurant'}</Text>
        </View>
        
        {/* Tabs - conditionné aux permissions */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {perms.edition?.acces && (
            <TouchableOpacity 
              style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: activeTab === 'edit' ? primaryColor : '#eee', alignItems: 'center' }}
              onPress={() => setActiveTab('edit')}
            >
              <Text style={{ fontWeight: '600', color: activeTab === 'edit' ? secondaryColor : '#666' }}>✏️ Édition</Text>
            </TouchableOpacity>
          )}
          {perms.ventes?.acces && (
            <TouchableOpacity 
              style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: activeTab === 'sales' ? primaryColor : '#eee', alignItems: 'center' }}
              onPress={() => setActiveTab('sales')}
            >
              <Text style={{ fontWeight: '600', color: activeTab === 'sales' ? secondaryColor : '#666' }}>📊 Ventes</Text>
            </TouchableOpacity>
          )}
          {perms.rapports?.acces && (
            <TouchableOpacity 
              style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: activeTab === 'report' ? primaryColor : '#eee', alignItems: 'center' }}
              onPress={() => setActiveTab('report')}
            >
              <Text style={{ fontWeight: '600', color: activeTab === 'report' ? secondaryColor : '#666' }}>📈 Rapports</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* EDIT TAB */}
        {activeTab === 'edit' && perms.edition?.acces && (
          <View>
            {/* Sélecteur de date pour planification */}
            <View style={{ marginBottom: 12, backgroundColor: '#f0f8ff', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: primaryColor }}>
              <Text style={{ fontWeight: '700', color: primaryColor, marginBottom: 6 }}>📅 Planifier pour :</Text>
              
              {/* Affichage de la date sélectionnée */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <TouchableOpacity
                  style={{ padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' }}
                  onPress={() => {
                    const d = new Date(editDate);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    if (d > today) {
                      d.setDate(d.getDate() - 1);
                      setEditDate(d.toISOString().split('T')[0]);
                    }
                  }}
                >
                  <Text style={{ fontSize: 18 }}>◀️</Text>
                </TouchableOpacity>
                
                <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 10 }}>
                  <Text style={{ fontWeight: '700', fontSize: 16, color: editDate === new Date().toISOString().split('T')[0] ? '#4CAF50' : primaryColor }}>
                    {new Date(editDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  {editDate === new Date().toISOString().split('T')[0] && (
                    <Text style={{ fontSize: 11, color: '#4CAF50' }}>Aujourd'hui</Text>
                  )}
                  {editDate > new Date().toISOString().split('T')[0] && (
                    <Text style={{ fontSize: 11, color: '#ff9800' }}>📋 Planifié</Text>
                  )}
                </View>
                
                <TouchableOpacity
                  style={{ padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' }}
                  onPress={() => {
                    const d = new Date(editDate);
                    const maxDate = new Date();
                    maxDate.setDate(maxDate.getDate() + 10);
                    if (d < maxDate) {
                      d.setDate(d.getDate() + 1);
                      setEditDate(d.toISOString().split('T')[0]);
                    }
                  }}
                >
                  <Text style={{ fontSize: 18 }}>▶️</Text>
                </TouchableOpacity>
              </View>
              
              {/* Indicateurs de jours planifiés */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 5 }}>
                {plannedDates.slice(0, 10).map((pd, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={{
                      padding: 8,
                      marginRight: 8,
                      borderRadius: 8,
                      backgroundColor: pd.date === editDate ? primaryColor : (pd.has_planning ? '#e8f5e9' : '#fff'),
                      borderWidth: 1,
                      borderColor: pd.has_planning ? '#4CAF50' : '#ddd',
                      minWidth: 50,
                      alignItems: 'center'
                    }}
                    onPress={() => setEditDate(pd.date)}
                  >
                    <Text style={{ fontSize: 10, color: pd.date === editDate ? '#fff' : '#666' }}>
                      {new Date(pd.date).toLocaleDateString('fr-FR', { weekday: 'short' })}
                    </Text>
                    <Text style={{ fontWeight: '600', color: pd.date === editDate ? '#fff' : (pd.has_planning ? '#4CAF50' : '#333') }}>
                      {new Date(pd.date).getDate()}
                    </Text>
                    {pd.has_planning && pd.date !== editDate && (
                      <Text style={{ fontSize: 8, color: '#4CAF50' }}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              {isLoadingPlanned && (
                <Text style={{ textAlign: 'center', color: '#666', marginTop: 10 }}>Chargement...</Text>
              )}
            </View>
            
            {/* Entrées */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>ENTRÉES</Text>
              {editEntree.map((item: any, idx: number) => (
                <View key={idx} style={{ marginBottom: 12 }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 6, fontWeight: '500' }}
                    placeholder="Nom de l'entrée"
                    value={item.name || ''}
                    onChangeText={(text) => handleInputChange(text, 'entree', idx, setEditEntree, editEntree)}
                  />
                  {/* Suggestions - affiché sous le champ */}
                  {showSuggestions?.category === 'entree' && showSuggestions?.index === idx && suggestions.length > 0 && (
                    <View style={{ backgroundColor: '#fffbe6', borderWidth: 2, borderColor: primaryColor, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <Text style={{ backgroundColor: primaryColor, color: '#fff', padding: 8, fontSize: 12, fontWeight: '600' }}>📜 Historique ({suggestions.length} résultats)</Text>
                      {suggestions.map((suggestion, sIdx) => (
                        <TouchableOpacity key={sIdx} style={{ padding: 12, borderBottomWidth: sIdx < suggestions.length - 1 ? 1 : 0, borderBottomColor: '#eee', backgroundColor: sIdx % 2 === 0 ? '#fff' : '#f9f9f9' }} onPress={() => selectSuggestion(suggestion, 'entree', idx)}>
                          <Text style={{ fontWeight: '600', color: primaryColor, fontSize: 14 }}>{suggestion.name}</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            📅 Dernier: {suggestion.last_date_formatted} | 📊 Total: {suggestion.total_sold} vendus
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, color: '#666' }}
                    placeholder="Description"
                    value={item.description || ''}
                    onChangeText={(text) => {
                      const updated = [...editEntree];
                      updated[idx] = {...updated[idx], description: text};
                      setEditEntree(updated);
                    }}
                  />
                </View>
              ))}
            </View>
            
            {/* Plats */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>PLATS</Text>
              {editPlat.map((item: any, idx: number) => (
                <View key={idx} style={{ marginBottom: 12 }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 6, fontWeight: '500' }}
                    placeholder="Nom du plat"
                    value={item.name || ''}
                    onChangeText={(text) => handleInputChange(text, 'plat', idx, setEditPlat, editPlat)}
                  />
                  {/* Suggestions - affiché sous le champ */}
                  {showSuggestions?.category === 'plat' && showSuggestions?.index === idx && suggestions.length > 0 && (
                    <View style={{ backgroundColor: '#fffbe6', borderWidth: 2, borderColor: primaryColor, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <Text style={{ backgroundColor: primaryColor, color: '#fff', padding: 8, fontSize: 12, fontWeight: '600' }}>📜 Historique ({suggestions.length} résultats)</Text>
                      {suggestions.map((suggestion, sIdx) => (
                        <TouchableOpacity key={sIdx} style={{ padding: 12, borderBottomWidth: sIdx < suggestions.length - 1 ? 1 : 0, borderBottomColor: '#eee', backgroundColor: sIdx % 2 === 0 ? '#fff' : '#f9f9f9' }} onPress={() => selectSuggestion(suggestion, 'plat', idx)}>
                          <Text style={{ fontWeight: '600', color: primaryColor, fontSize: 14 }}>{suggestion.name}</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            📅 Dernier: {suggestion.last_date_formatted} | 📊 Total: {suggestion.total_sold} vendus
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, color: '#666' }}
                    placeholder="Description"
                    value={item.description || ''}
                    onChangeText={(text) => {
                      const updated = [...editPlat];
                      updated[idx] = {...updated[idx], description: text};
                      setEditPlat(updated);
                    }}
                  />
                </View>
              ))}
            </View>
            
            {/* Desserts */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>DESSERTS</Text>
              {editDessert.map((item: any, idx: number) => (
                <View key={idx} style={{ marginBottom: 12 }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 6, fontWeight: '500' }}
                    placeholder="Nom du dessert"
                    value={item.name || ''}
                    onChangeText={(text) => handleInputChange(text, 'dessert', idx, setEditDessert, editDessert)}
                  />
                  {/* Suggestions - affiché sous le champ */}
                  {showSuggestions?.category === 'dessert' && showSuggestions?.index === idx && suggestions.length > 0 && (
                    <View style={{ backgroundColor: '#fffbe6', borderWidth: 2, borderColor: primaryColor, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <Text style={{ backgroundColor: primaryColor, color: '#fff', padding: 8, fontSize: 12, fontWeight: '600' }}>📜 Historique ({suggestions.length} résultats)</Text>
                      {suggestions.map((suggestion, sIdx) => (
                        <TouchableOpacity key={sIdx} style={{ padding: 12, borderBottomWidth: sIdx < suggestions.length - 1 ? 1 : 0, borderBottomColor: '#eee', backgroundColor: sIdx % 2 === 0 ? '#fff' : '#f9f9f9' }} onPress={() => selectSuggestion(suggestion, 'dessert', idx)}>
                          <Text style={{ fontWeight: '600', color: primaryColor, fontSize: 14 }}>{suggestion.name}</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            📅 Dernier: {suggestion.last_date_formatted} | 📊 Total: {suggestion.total_sold} vendus
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, color: '#666' }}
                    placeholder="Description"
                    value={item.description || ''}
                    onChangeText={(text) => {
                      const updated = [...editDessert];
                      updated[idx] = {...updated[idx], description: text};
                      setEditDessert(updated);
                    }}
                  />
                </View>
              ))}
            </View>
            
            {/* Prix Formules */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>💰 PRIX FORMULES</Text>
              {[
                {key: 'plat_du_jour', label: 'Plat du jour'},
                {key: 'entree_plat', label: 'Entrée + Plat'},
                {key: 'plat_dessert', label: 'Plat + Dessert'},
                {key: 'entree_plat_dessert', label: 'Entrée + Plat + Dessert'}
              ].map(({key, label}) => (
                <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ fontWeight: '500' }}>{label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, width: 80, textAlign: 'center' }}
                      keyboardType="decimal-pad"
                      value={String(editFormulePrices[key] || 0)}
                      onChangeText={(text) => setEditFormulePrices({...editFormulePrices, [key]: parseFloat(text) || 0})}
                    />
                    <Text>€</Text>
                  </View>
                </View>
              ))}
            </View>
            
            {/* Bouton enregistrer - seulement si mode modifier */}
            {perms.edition?.mode === 'modifier' && (
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 16, borderRadius: 10, alignItems: 'center' }}
                onPress={handleSaveArdoise}
                disabled={isLoading}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 16 }}>
                  {isLoading ? '⏳ Enregistrement...' : '💾 Enregistrer les modifications'}
                </Text>
              </TouchableOpacity>
            )}
            {perms.edition?.mode === 'lecture' && (
              <View style={{ backgroundColor: '#f0f0f0', padding: 14, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#999', fontWeight: '500', fontSize: 14 }}>
                  👁️ Mode lecture seule - Vous ne pouvez pas modifier l'ardoise
                </Text>
              </View>
            )}
            
            {/* Export Planning Buttons */}
            <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <Text style={{ fontWeight: '600', color: '#666', marginBottom: 12, textAlign: 'center' }}>📤 Exporter le planning (10 jours)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity 
                  style={{ flex: 1, backgroundColor: '#e74c3c', padding: 12, borderRadius: 8, alignItems: 'center' }}
                  onPress={handleExportPlanningPDF}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>📄 PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, backgroundColor: '#27ae60', padding: 12, borderRadius: 8, alignItems: 'center' }}
                  onPress={handleExportPlanningExcel}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>📊 Excel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        
        {/* SALES TAB */}
        {activeTab === 'sales' && perms.ventes?.acces && (
          <View>
            <Text style={{ textAlign: 'center', color: '#666', marginBottom: 20 }}>Saisissez les quantités vendues pour un jour/service</Text>
            
            {/* Date selector */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontWeight: '600', marginBottom: 8, color: primaryColor }}>📅 Date :</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  style={{ padding: 8, backgroundColor: '#eee', borderRadius: 8 }}
                  onPress={() => {
                    const d = new Date(salesDate);
                    d.setDate(d.getDate() - 1);
                    setSalesDate(d.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>◀️</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '600', fontSize: 16 }}>
                    {new Date(salesDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                  {salesDate === new Date().toISOString().split('T')[0] && (
                    <Text style={{ fontSize: 12, color: '#4CAF50', marginTop: 4 }}>Aujourd'hui</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={{ padding: 8, backgroundColor: salesDate >= new Date().toISOString().split('T')[0] ? '#ddd' : '#eee', borderRadius: 8 }}
                  onPress={() => {
                    if (salesDate < new Date().toISOString().split('T')[0]) {
                      const d = new Date(salesDate);
                      d.setDate(d.getDate() + 1);
                      setSalesDate(d.toISOString().split('T')[0]);
                    }
                  }}
                  disabled={salesDate >= new Date().toISOString().split('T')[0]}
                >
                  <Text style={{ fontSize: 18, opacity: salesDate >= new Date().toISOString().split('T')[0] ? 0.3 : 1 }}>▶️</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={{ marginTop: 8, alignSelf: 'center' }}
                onPress={() => setSalesDate(new Date().toISOString().split('T')[0])}
              >
                <Text style={{ color: primaryColor, fontSize: 12 }}>↩️ Revenir à aujourd'hui</Text>
              </TouchableOpacity>
            </View>
            
            {/* Service selector */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: salesService === 'midi' ? primaryColor : '#eee', alignItems: 'center' }}
                onPress={() => setSalesService('midi')}
              >
                <Text style={{ fontWeight: '600', color: salesService === 'midi' ? secondaryColor : '#666' }}>🌞 Midi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: salesService === 'soir' ? primaryColor : '#eee', alignItems: 'center' }}
                onPress={() => setSalesService('soir')}
              >
                <Text style={{ fontWeight: '600', color: salesService === 'soir' ? secondaryColor : '#666' }}>🌙 Soir</Text>
              </TouchableOpacity>
            </View>
            
            {/* Entrées */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>ENTRÉES VENDUES</Text>
              {salesEntree.map((item: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '500' }}>{item.name || `Entrée ${idx + 1}`}</Text>
                    {item.description && <Text style={{ fontSize: 12, color: '#888' }}>{item.description}</Text>}
                  </View>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, width: 70, textAlign: 'center' }}
                    keyboardType="number-pad"
                    value={String(item.quantity_sold || 0)}
                    onChangeText={(text) => {
                      const updated = [...salesEntree];
                      updated[idx] = {...updated[idx], quantity_sold: parseInt(text) || 0};
                      setSalesEntree(updated);
                    }}
                  />
                </View>
              ))}
            </View>
            
            {/* Plats */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>PLATS VENDUS</Text>
              {salesPlat.map((item: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '500' }}>{item.name || `Plat ${idx + 1}`}</Text>
                    {item.description && <Text style={{ fontSize: 12, color: '#888' }}>{item.description}</Text>}
                  </View>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, width: 70, textAlign: 'center' }}
                    keyboardType="number-pad"
                    value={String(item.quantity_sold || 0)}
                    onChangeText={(text) => {
                      const updated = [...salesPlat];
                      updated[idx] = {...updated[idx], quantity_sold: parseInt(text) || 0};
                      setSalesPlat(updated);
                    }}
                  />
                </View>
              ))}
            </View>
            
            {/* Desserts */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>DESSERTS VENDUS</Text>
              {salesDessert.map((item: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '500' }}>{item.name || `Dessert ${idx + 1}`}</Text>
                    {item.description && <Text style={{ fontSize: 12, color: '#888' }}>{item.description}</Text>}
                  </View>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, width: 70, textAlign: 'center' }}
                    keyboardType="number-pad"
                    value={String(item.quantity_sold || 0)}
                    onChangeText={(text) => {
                      const updated = [...salesDessert];
                      updated[idx] = {...updated[idx], quantity_sold: parseInt(text) || 0};
                      setSalesDessert(updated);
                    }}
                  />
                </View>
              ))}
            </View>
            
            {/* Bouton enregistrer - seulement si mode modifier */}
            {perms.ventes?.mode === 'modifier' && (
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 16, borderRadius: 10, alignItems: 'center' }}
                onPress={handleSaveSales}
                disabled={isLoading}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 16 }}>
                  {isLoading ? '⏳ Enregistrement...' : '📊 Enregistrer les ventes du service'}
                </Text>
              </TouchableOpacity>
            )}
            {perms.ventes?.mode === 'lecture' && (
              <View style={{ backgroundColor: '#f0f0f0', padding: 14, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#999', fontWeight: '500', fontSize: 14 }}>
                  👁️ Mode lecture seule - Vous ne pouvez pas modifier les ventes
                </Text>
              </View>
            )}
          </View>
        )}
        
        {/* REPORT TAB */}
        {activeTab === 'report' && perms.rapports?.acces && (
          <View>
            {/* Period selector */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {(['week', 'month', 'year'] as const).map((period) => (
                <TouchableOpacity
                  key={period}
                  style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: ardoiseReportPeriod === period ? primaryColor : '#eee', alignItems: 'center' }}
                  onPress={() => setArdoiseReportPeriod(period)}
                >
                  <Text style={{ fontWeight: '600', fontSize: 12, color: ardoiseReportPeriod === period ? secondaryColor : '#666' }}>{periodLabels[period]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Total Box */}
            {ardoiseReport && (
              <>
                <View style={{ flexDirection: 'row', backgroundColor: primaryColor, padding: 20, borderRadius: 10, marginBottom: 20 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: secondaryColor }}>{ardoiseReport.total_by_category?.entree || 0}</Text>
                    <Text style={{ fontSize: 12, color: secondaryColor, opacity: 0.8 }}>Entrées</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: secondaryColor }}>{ardoiseReport.total_by_category?.plat || 0}</Text>
                    <Text style={{ fontSize: 12, color: secondaryColor, opacity: 0.8 }}>Plats</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: secondaryColor }}>{ardoiseReport.total_by_category?.dessert || 0}</Text>
                    <Text style={{ fontSize: 12, color: secondaryColor, opacity: 0.8 }}>Desserts</Text>
                  </View>
                </View>
                
                {/* Daily Details */}
                <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#EAE6CA' }}>📋 DÉTAIL PAR JOUR</Text>
                
                {ardoiseReport.daily_details && ardoiseReport.daily_details.length > 0 ? (
                  ardoiseReport.daily_details.map((day: any, idx: number) => {
                    const dateObj = new Date(day.date);
                    const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                    const hasItems = (day.entree?.some((e: any) => e.quantity_sold > 0) || 
                                     day.plat?.some((p: any) => p.quantity_sold > 0) || 
                                     day.dessert?.some((d: any) => d.quantity_sold > 0));
                    if (!hasItems) return null;
                    
                    return (
                      <View key={idx} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 15, marginBottom: 12 }}>
                        <Text style={{ fontWeight: '700', color: primaryColor, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EAE6CA' }}>📅 {dateStr}</Text>
                        {day.entree?.filter((e: any) => e.quantity_sold > 0).map((e: any, i: number) => (
                          <View key={`e${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                            <Text><Text style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Entrée </Text>{e.name}</Text>
                            <Text style={{ fontWeight: '600' }}>{e.quantity_sold}</Text>
                          </View>
                        ))}
                        {day.plat?.filter((p: any) => p.quantity_sold > 0).map((p: any, i: number) => (
                          <View key={`p${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                            <Text><Text style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Plat </Text>{p.name}</Text>
                            <Text style={{ fontWeight: '600' }}>{p.quantity_sold}</Text>
                          </View>
                        ))}
                        {day.dessert?.filter((d: any) => d.quantity_sold > 0).map((d: any, i: number) => (
                          <View key={`d${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                            <Text><Text style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Dessert </Text>{d.name}</Text>
                            <Text style={{ fontWeight: '600' }}>{d.quantity_sold}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })
                ) : (
                  <Text style={{ textAlign: 'center', color: '#888', padding: 20 }}>Aucune vente enregistrée pour cette période</Text>
                )}
                
                {/* Export buttons - conditionné aux permissions */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  {perms.rapports?.export_pdf && (
                    <TouchableOpacity 
                      style={{ flex: 1, backgroundColor: '#4CAF50', padding: 14, borderRadius: 10, alignItems: 'center' }}
                      onPress={handleExportPDF}
                    >
                      <Text style={{ color: 'white', fontWeight: '600' }}>📄 PDF</Text>
                    </TouchableOpacity>
                  )}
                  {perms.rapports?.export_excel && (
                    <TouchableOpacity 
                      style={{ flex: 1, backgroundColor: '#2196F3', padding: 14, borderRadius: 10, alignItems: 'center' }}
                      onPress={handleExportExcel}
                    >
                      <Text style={{ color: 'white', fontWeight: '600' }}>📊 Excel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24 },
  loginContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  logoSection: { alignItems: 'center', marginBottom: 48 },
  loginLogo: { width: 80, height: 80, borderRadius: 16 },
  neochefLogoContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  neochefLogoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#D4AF37', justifyContent: 'center', alignItems: 'center', shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20 },
  neochefLogoText: { fontSize: 56, fontWeight: 'bold', color: '#1a1a2e', fontStyle: 'italic' },
  appTitle: { fontSize: 32, fontWeight: 'bold', marginTop: 16 },
  appSubtitle: { fontSize: 16, marginTop: 8, opacity: 0.8 },
  buttonSection: { gap: 16 },
  accessButton: { padding: 24, borderRadius: 16, alignItems: 'center' },
  accessButtonText: { fontSize: 20, fontWeight: 'bold', marginTop: 8 },
  accessButtonSubtext: { fontSize: 14, marginTop: 4, opacity: 0.7 },
  createRestaurantLink: { marginTop: 32, alignItems: 'center' },
  createRestaurantText: { fontSize: 14, textDecorationLine: 'underline' },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  backText: { fontSize: 16, marginLeft: 8 },
  formHeader: { alignItems: 'center', marginBottom: 32 },
  formTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 16 },
  formContainer: { gap: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 56, fontSize: 16, color: '#333' },
  errorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffeeee', padding: 12, borderRadius: 8 },
  errorText: { marginLeft: 8, color: '#ff4444', flex: 1 },
  successContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8 },
  successText: { marginLeft: 8, color: '#4CAF50', flex: 1 },
  forgotPasswordLink: { alignItems: 'center', marginTop: 16 },
  forgotPasswordText: { fontSize: 14, textDecorationLine: 'underline' },
  forgotText: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  submitButton: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitButtonText: { fontSize: 18, fontWeight: 'bold' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, paddingTop: 8 },
  headerLeft: { width: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerLogo: { width: 40, height: 40 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  headerUserInfo: { alignItems: 'flex-end', marginRight: 12 },
  userName: { fontSize: 14 },
  userRole: { fontSize: 11 },
  logoutButton: { padding: 4 },
  headerIconButton: { padding: 8, marginRight: 4 },
  managerMenu: { position: 'absolute', top: 70, right: 60, borderRadius: 12, padding: 8, borderWidth: 1, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  managerMenuLeft: { position: 'absolute', top: 70, left: 16, borderRadius: 12, padding: 8, borderWidth: 1, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  managerMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  managerMenuText: { fontSize: 15, marginLeft: 12, fontWeight: '500' },
  content: { flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 8, paddingBottom: 0, minHeight: 50 },
  navItem: { alignItems: 'center', padding: 2, minWidth: 40 },
  navText: { fontSize: 10, marginTop: 4 },
  screenContainer: { flex: 1, padding: 16 },
  screenTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  screenSubtitle: { fontSize: 14, marginBottom: 16, color: '#666' },
  screenHeader: { marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 10 },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  dateArrow: { padding: 6 },
  dateDisplay: { alignItems: 'center', minWidth: 180 },
  dateText: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  todayBadge: { fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
  progressSection: { marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { fontSize: 14 },
  progressPercent: { fontSize: 14, fontWeight: 'bold' },
  progressBar: { height: 8, backgroundColor: '#ddd', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  categoryFilter: { marginBottom: 16, maxHeight: 40 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#ddd' },
  categoryChipText: { fontSize: 14, fontWeight: '500' },
  tasksList: { flex: 1 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyStateText: { fontSize: 18, color: '#999', marginTop: 16 },
  emptyStateSubtext: { fontSize: 14, color: '#bbb', marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  categorySection: { marginBottom: 24 },
  categorySectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  categorySectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  staffCount: { fontSize: 12, color: '#888' },
  taskItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 8 },
  taskCompleted: { opacity: 0.6 },
  taskCheckbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 16, fontWeight: '500', color: '#333' },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: '#999' },
  taskDescription: { fontSize: 14, color: '#666', marginTop: 4 },
  taskAssigned: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  taskBadge: { fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' },
  permanentCategoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  permanentTaskItemBorder: { borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  // Permanent Tasks Screen Styles
  permanentCategoryContainer: { marginBottom: 16, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden' },
  permanentCategoryHeaderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderLeftWidth: 4 },
  permanentCategoryLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  permanentCategoryName: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
  taskCount: { fontSize: 13, color: '#888', marginLeft: 8 },
  permanentCategoryActions: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 4 },
  permanentTasksList: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#f9f9f9' },
  permanentTaskItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  permanentTaskItemInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  permanentTaskContent: { flex: 1 },
  permanentTaskTitle: { fontSize: 15, fontWeight: '500', color: '#333' },
  permanentTaskDescription: { fontSize: 13, color: '#666', marginTop: 2 },
  recurrenceBadge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 6 },
  deleteTaskButton: { padding: 4, marginLeft: 8 },
  addTaskForm: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  addTaskButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  recurrenceForm: { marginTop: 12 },
  recurrenceTypeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  recurrenceTypeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee' },
  recurrenceTypeText: { fontSize: 13, fontWeight: '500', color: '#666' },
  recurrenceHint: { fontSize: 12, color: '#888', marginTop: 12, marginBottom: 8 },
  daySelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayButton: { width: 42, height: 36, borderRadius: 8, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  dayButtonText: { fontSize: 12, fontWeight: '600', color: '#666' },
  monthDaySelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  monthDayButton: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  monthDayButtonText: { fontSize: 11, fontWeight: '600', color: '#666' },
  cancelTaskButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelTaskText: { color: '#666', fontWeight: '500' },
  confirmTaskButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  confirmTaskText: { fontWeight: '600' },
  addTaskButton: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  addTaskButtonText: { marginLeft: 6, fontWeight: '500' },
  addCategoryModal: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 16 },
  inlineEditInput: { fontSize: 16, fontWeight: '600', borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, minWidth: 150 },
  templateWrapper: { marginBottom: 8 },
  templateItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 8 },
  templateContent: { flex: 1 },
  templateTitle: { fontSize: 16, fontWeight: '500' },
  templateDescription: { fontSize: 14, color: '#666', marginTop: 4 },
  templateDeleteButton: { padding: 8 },
  taskTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  taskTypeBadgeText: { fontSize: 11, fontWeight: '600' },
  taskTypeSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  taskTypeOption: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: '#ddd', alignItems: 'center' },
  taskTypeOptionText: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  taskTypeOptionHint: { fontSize: 11, marginTop: 2 },
  recurrenceSection: { marginBottom: 8 },
  selectableTemplate: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  selectableTemplateDisabled: { opacity: 0.5 },
  templateCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  templateSelectContent: { flex: 1 },
  templateSelectTitle: { fontSize: 16, fontWeight: '500', color: '#333' },
  templateSelectDescription: { fontSize: 14, color: '#666', marginTop: 4 },
  assignButton: { padding: 8, borderRadius: 20, marginLeft: 8 },
  pendingSection: { borderRadius: 12, padding: 16, marginBottom: 16 },
  pendingSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pendingSectionTitle: { fontSize: 16, fontWeight: 'bold' },
  sendButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  sendButtonText: { color: 'white', fontWeight: 'bold', marginLeft: 6 },
  sendButtonContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 12 },
  sendButtonLarge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 25, minWidth: 160 },
  sendButtonLargeText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  pendingCountText: { fontSize: 15, fontWeight: '500' },
  pendingTaskItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 8 },
  pendingTaskContent: { flex: 1 },
  pendingTaskTitle: { fontSize: 15, fontWeight: '500', color: '#333' },
  pendingTaskCategory: { fontSize: 13, color: '#666', marginTop: 2 },
  removePendingButton: { padding: 4 },
  addPunctualButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  addPunctualButtonText: { fontSize: 16, fontWeight: '500', marginLeft: 8 },
  confirmSelectionButton: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  confirmSelectionButtonText: { fontSize: 16, fontWeight: 'bold' },
  addButton: { position: 'absolute', right: 24, bottom: 24, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  addButtonText: { fontWeight: '600', marginLeft: 8 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalCancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
  modalCancelText: { color: '#666', fontWeight: '500' },
  modalConfirmButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  modalConfirmText: { fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalBody: { padding: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, backgroundColor: 'white' },
  modalInputMultiline: { height: 100, textAlignVertical: 'top' },
  categoryOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#ddd' },
  categoryOptionText: { fontSize: 14, fontWeight: '500' },
  modalSubmitButton: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 20 },
  modalSubmitButtonText: { fontSize: 18, fontWeight: 'bold' },
  addCategorySection: { marginBottom: 24 },
  addCategoryInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  addCategoryTextInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, backgroundColor: 'white' },
  addCategoryButton: { paddingHorizontal: 20, paddingVertical: 14 },
  categoriesList: { gap: 12 },
  categoryItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: 16, borderRadius: 12 },
  categoryItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  categoryIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  categoryIconText: { fontSize: 16, fontWeight: 'bold' },
  categoryItemName: { fontSize: 16, fontWeight: '500' },
  categoryItemActions: { flexDirection: 'row', alignItems: 'center' },
  categoryEditButton: { padding: 8 },
  categoryDeleteButton: { padding: 8 },
  usersList: { gap: 12 },
  userItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: 16, borderRadius: 12 },
  userItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  userAvatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userInfo: { flex: 1 },
  userName2: { fontSize: 16, fontWeight: '600' },
  userEmail: { fontSize: 14, color: '#666', marginTop: 2 },
  userCategories: { fontSize: 12, color: '#888', marginTop: 4 },
  editUserName: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  editUserEmail: { fontSize: 14, color: '#666', marginBottom: 8 },
  userRoleText: { fontSize: 12, marginTop: 4 },
  userActions: { flexDirection: 'row', gap: 8 },
  userActionButton: { padding: 8 },
  permissionButton: { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 },
  permissionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  permissionBadge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  permUserHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  permSectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  permissionToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', marginBottom: 12, backgroundColor: 'white' },
  permToggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  permToggleIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  permToggleTitle: { fontSize: 16, fontWeight: '600' },
  permToggleDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  permToggleSwitch: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#ddd', justifyContent: 'center', paddingHorizontal: 4 },
  permToggleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'white' },
  categoriesSection: { marginTop: 8, padding: 16, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 12 },
  permSubSectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  permSubSectionDesc: { fontSize: 12, color: '#666', marginBottom: 12 },
  warningText: { fontSize: 12, color: '#ff6b6b', marginTop: 8 },
  permSummary: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginTop: 16 },
  permSummaryText: { fontSize: 13, marginLeft: 8, flex: 1 },
  categoryCheckboxList: { gap: 12, marginTop: 8 },
  categoryCheckboxItem: { flexDirection: 'row', alignItems: 'center' },
  categoryCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  categoryCheckboxLabel: { fontSize: 16, color: '#333' },
  historyList: { gap: 16 },
  historyItem: { flexDirection: 'row', alignItems: 'flex-start' },
  historyDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  historyContent: { flex: 1 },
  historyText: { fontSize: 15, color: '#333', lineHeight: 22 },
  historyUserName: { fontWeight: 'bold' },
  historyTaskTitle: { fontStyle: 'italic' },
  historyTime: { fontSize: 12, color: '#999', marginTop: 4 },
  settingsSection: { marginBottom: 32 },
  settingsLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  settingsInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, backgroundColor: 'white' },
  logoUploadButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: 12, padding: 20, borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed' },
  logoPreview: { width: 120, height: 120 },
  logoPlaceholder: { alignItems: 'center' },
  logoPlaceholderText: { marginTop: 8, color: '#999' },
  colorPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorPreset: { alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', backgroundColor: 'white' },
  colorPresetSelected: { borderColor: '#333' },
  colorPresetPreview: { flexDirection: 'row', width: 60, height: 30, borderRadius: 6, overflow: 'hidden' },
  colorPresetPrimary: { flex: 1 },
  colorPresetSecondary: { flex: 1 },
  colorPresetName: { fontSize: 12, marginTop: 8, color: '#666' },
  colorInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  colorInputLabel: { fontSize: 14, color: '#666', width: 130 },
  colorInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: 'white' },
  colorPreviewBox: { width: 40, height: 40, borderRadius: 8, marginLeft: 12, borderWidth: 1, borderColor: '#ddd' },
  colorHint: { fontSize: 12, color: '#888', marginTop: 4 },
  saveButton: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16, marginBottom: 40 },
  saveButtonText: { fontSize: 18, fontWeight: 'bold' },
  categoryLinkButton: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderRadius: 12, borderWidth: 1 },
  categoryLinkText: { fontSize: 16, fontWeight: '600' },
  categoryLinkSubtext: { fontSize: 13, color: '#666', marginTop: 2 },
  userPickerItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  userPickerName: { fontSize: 16, marginLeft: 12 },
  // Multi-Restaurant Styles
  restaurantPickerItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', borderRadius: 8, marginBottom: 4 },
  restaurantPickerName: { fontSize: 16, fontWeight: '600' },
  restaurantPickerDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  addRestaurantButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', marginTop: 12 },
  addRestaurantButtonText: { fontSize: 14, fontWeight: '500', marginLeft: 8 },
  // Holding Action Styles
  holdingActionButton: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderStyle: 'solid' },
  holdingActionTitle: { fontSize: 16, fontWeight: '600' },
  holdingActionSubtitle: { fontSize: 13, marginTop: 2 },
  // Holding Empty State Styles
  emptyHoldingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyHoldingTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 24, textAlign: 'center' },
  emptyHoldingSubtitle: { fontSize: 16, marginTop: 12, textAlign: 'center', opacity: 0.8 },
  emptyHoldingHint: { fontSize: 13, marginTop: 24, textAlign: 'center' },
  addRestaurantButtonLarge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 18, borderRadius: 16, marginTop: 32 },
  addRestaurantButtonLargeText: { fontSize: 18, fontWeight: 'bold', marginLeft: 12 },
  linkRestaurantHint: { fontSize: 14, textAlign: 'center' },
  formSubtitle: { fontSize: 14, textAlign: 'center' },
  // Subtask Styles
  choiceButton: { padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  choiceButtonText: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  quantityButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  // ============ Nouveau Système de Permissions ============
  permTabsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  permTab: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  permTabText: { fontSize: 16, fontWeight: 'bold', color: '#666' },
  permPageTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  permGroupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  permDivider: { height: 1, backgroundColor: '#eee', marginVertical: 16 },
  permToggleCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 8, backgroundColor: '#fff' },
  permToggleLabelCompact: { fontSize: 14, fontWeight: '500', flex: 1 },
  permToggleSwitchSmall: { width: 40, height: 24, borderRadius: 12, backgroundColor: '#ddd', justifyContent: 'center', padding: 2 },
  permToggleDotSmall: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  subPermsContainer: { paddingLeft: 16, paddingTop: 8, paddingBottom: 8, borderLeftWidth: 2, borderLeftColor: '#ddd', marginLeft: 8, marginBottom: 8 },
  permSubLabel: { fontSize: 13, color: '#666', marginBottom: 6, marginTop: 8 },
  actionPermsContainer: { marginBottom: 12 },
  actionPermsLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  actionPermsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionPermBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f8f8f8' },
  actionPermBtnActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  actionPermBtnText: { fontSize: 12, color: '#666' },
  sectionPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  sectionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
  sectionBtnActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  sectionBtnText: { fontSize: 13, color: '#666' },
  exportPermsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  permNavButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, marginBottom: 32, gap: 12 },
  permNavBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 10, borderWidth: 1, gap: 6, flex: 1 },
  permNavBtnNext: { borderWidth: 0 },
  permNavBtnText: { fontSize: 15, fontWeight: '600' },
  // ============ Settings Dropdown ============
  settingsDropdown: { position: 'absolute', top: 56, right: 8, width: 200, borderRadius: 12, borderWidth: 1, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  settingsDropdownHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)' },
  settingsDropdownName: { fontSize: 16, fontWeight: 'bold' },
  settingsDropdownRole: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  settingsDropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  settingsDropdownText: { fontSize: 15 },
  settingsDropdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  // ============ Ardoise Permissions ============
  permSectionBox: { padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: '#fafafa' },
  modeSelector: { marginTop: 12, paddingTop: 8 },
  modeSelectorLabel: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  modeOptions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  modeOptionText: { fontSize: 13, fontWeight: '500', color: '#666' },
  exportOptions: { marginTop: 8, gap: 4 },
});
// Build timestamp: 1773224689
