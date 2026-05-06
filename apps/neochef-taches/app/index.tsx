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

const DEFAULT_PRIMARY = '#2C5F2D';
const DEFAULT_SECONDARY = '#EAE6CA';

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
  const [currentScreen, setCurrentScreen] = useState<'daily' | 'templates' | 'prepare' | 'categories' | 'users' | 'settings' | 'history' | 'menuGroupe' | 'createGroup' | 'permanentTasks' | 'orderPrep' | 'ficheTechnique' | 'menuRestaurant' | 'events' | 'facturation' | 'rapportArdoise' | 'prestataires' | 'superadmin'>('daily');
  const [categories, setCategories] = useState<Category[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [pendingTasks, setPendingTasks] = useState<DailyTask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [prepareDate, setPrepareDate] = useState(getTomorrowDate());
  
  // Super Admin State
  const [superadminRestaurants, setSuperadminRestaurants] = useState<any[]>([]);
  const [allUsersAdmin, setAllUsersAdmin] = useState<any[]>([]);
  const [superadminStats, setSuperadminStats] = useState<any>(null);
  
  // Menu Groupe State
  const [menuSections, setMenuSections] = useState<MenuSection[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [groupReservations, setGroupReservations] = useState<GroupReservation[]>([]);
  const [showManagerMenu, setShowManagerMenu] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  
  // Permanent Tasks State
  const [permanentCategories, setPermanentCategories] = useState<any[]>([]);
  const [permanentTasks, setPermanentTasks] = useState<any[]>([]);
  
  // Subtasks State (pour l'écran des tâches quotidiennes)
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtaskCompletions, setSubtaskCompletions] = useState<any[]>([]);
  
  // Permanent Subtasks State
  const [permanentSubtasks, setPermanentSubtasks] = useState<any[]>([]);
  const [permanentSubtaskCompletions, setPermanentSubtaskCompletions] = useState<any[]>([]);
  
  // Préparation de Commande State (Order Preparation)
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<any[]>([]);
  
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
  
  // Events State (Module Événements)
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [eventProviders, setEventProviders] = useState<any[]>([]);
  const [eventTasks, setEventTasks] = useState<any[]>([]);
  const [eventMenuSections, setEventMenuSections] = useState<any[]>([]);
  const [eventMenuItems, setEventMenuItems] = useState<any[]>([]);
  const [eventPricePackages, setEventPricePackages] = useState<any[]>([]);
  const [eventDrinkOptions, setEventDrinkOptions] = useState<any[]>([]);
  
  // Facturation State (Devis et Factures)
  const [invoices, setInvoices] = useState<any[]>([]);
  
  // Ardoise State (Rapport des ventes)
  const [ardoiseData, setArdoiseData] = useState<any>(null);
  const [ardoiseSalesHistory, setArdoiseSalesHistory] = useState<any[]>([]);
  const [ardoiseReportPeriod, setArdoiseReportPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [ardoiseReport, setArdoiseReport] = useState<any>(null);
  
  // État pour la page client publique
  const [groupToken, setGroupToken] = useState<string | null>(null);
  // État pour afficher la vue staff quand groupToken est présent
  const [showStaffGroupView, setShowStaffGroupView] = useState(false);
  // État pour le formulaire public de demande de groupe
  const [publicGroupRequestRestaurantId, setPublicGroupRequestRestaurantId] = useState<string | null>(null);
  // État pour le suivi de réservation client
  const [trackGroupToken, setTrackGroupToken] = useState<string | null>(null);
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

  // Update PWA safe area colors when primary color changes
  useEffect(() => {
    updatePWASafeAreaColor(primaryColor);
  }, [primaryColor]);
  
  // Update bottom safe area color based on current screen (for screens without bottom nav)
  useEffect(() => {
    const screensWithoutBottomNav = ['ficheTechnique', 'menuRestaurant', 'menuRestaurantDraft', 'events', 'facturation', 'rapportArdoise', 'menuGroupe', 'orderPrep'];
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

  // Check for group_token in URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      
      // Check for group_token (sélection menu client existant)
      const gToken = urlParams.get('group_token');
      if (gToken) {
        setGroupToken(gToken);
        // Ne PAS faire return - continuer pour charger la session si elle existe
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      // Check for group_request (formulaire public de demande de réservation)
      const groupRequestRestId = urlParams.get('group_request');
      if (groupRequestRestId) {
        setPublicGroupRequestRestaurantId(groupRequestRestId);
        setIsLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      
      // Check for track_group (suivi de réservation par le client)
      const trackToken = urlParams.get('track_group');
      if (trackToken) {
        setTrackGroupToken(trackToken);
        setIsLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
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
      await loadDailyTasks(token, selectedDate);
      await loadTaskTemplates(token);
      await loadUsers(token);
      // Charger les sous-tâches et leurs complétions
      console.log('[fetchUserData] About to load subtasks...');
      await loadSubtasks(token);
      console.log('[fetchUserData] loadSubtasks done');
      await loadSubtaskCompletions(selectedDate, token);
      console.log('[fetchUserData] loadSubtaskCompletions done');
      // Charger les sous-tâches permanentes
      console.log('[fetchUserData] About to load permanent subtasks...');
      await loadPermanentSubtasks(token);
      console.log('[fetchUserData] loadPermanentSubtasks done');
      await loadPermanentSubtaskCompletions(selectedDate, token);
      console.log('[fetchUserData] All loading done');
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

  const loadTaskTemplates = async (token?: string) => {
    try { const data = await apiRequest('/task-templates/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setTaskTemplates(data); }
    catch (error) { console.error('Error loading task templates:', error); }
  };

  const loadDailyTasks = async (token?: string, date?: string) => {
    try {
      const queryDate = date || selectedDate;
      const data = await apiRequest(`/daily-tasks/list?date=${queryDate}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined });
      setDailyTasks(data);
    } catch (error) { console.error('Error loading daily tasks:', error); }
  };

  const loadPendingTasks = async (date?: string) => {
    try { const queryDate = date || prepareDate; const data = await apiRequest(`/daily-tasks/pending?date=${queryDate}`); setPendingTasks(data); }
    catch (error) { console.error('Error loading pending tasks:', error); }
  };

  const loadUsers = async (token?: string) => {
    try { const data = await apiRequest('/users/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setUsers(data); }
    catch (error) { console.error('Error loading users:', error); }
  };

  const loadHistory = async () => {
    try { const data = await apiRequest(`/history?date=${selectedDate}`); setHistory(data); }
    catch (error) { console.error('Error loading history:', error); }
  };

  // Prestataires Functions
  const loadPrestataires = async () => {
    try { const data = await apiRequest('/prestataires/list'); setPrestataires(data || []); }
    catch (error) { console.error('Error loading prestataires:', error); setPrestataires([]); }
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

  // Menu Groupe Functions
  const loadMenuSections = async (token?: string) => {
    try { const data = await apiRequest('/menu-sections/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setMenuSections(data); }
    catch (error) { console.error('Error loading menu sections:', error); }
  };

  const loadMenuItems = async (token?: string) => {
    try { const data = await apiRequest('/menu-items/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setMenuItems(data); }
    catch (error) { console.error('Error loading menu items:', error); }
  };

  const loadGroupReservations = async (token?: string) => {
    try { const data = await apiRequest('/group-reservations/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setGroupReservations(data); }
    catch (error) { console.error('Error loading group reservations:', error); }
  };

  // Permanent Tasks Functions
  const loadPermanentCategories = async (token?: string) => {
    try { const data = await apiRequest('/permanent-categories/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setPermanentCategories(data); }
    catch (error) { console.error('Error loading permanent categories:', error); }
  };

  const loadPermanentTasks = async (token?: string) => {
    try { const data = await apiRequest('/permanent-tasks/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); setPermanentTasks(data); }
    catch (error) { console.error('Error loading permanent tasks:', error); }
  };

  // Subtasks Functions (pour l'écran des tâches quotidiennes)
  const loadSubtasks = async (token?: string) => {
    try { 
      console.log('[loadSubtasks] Loading subtasks with token:', token ? 'yes' : 'no');
      const data = await apiRequest('/subtasks/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      console.log('[loadSubtasks] Subtasks loaded:', data?.length || 0);
      setSubtasks(data); 
    }
    catch (error) { console.error('Error loading subtasks:', error); }
  };

  const loadSubtaskCompletions = async (date: string, token?: string) => {
    try { 
      const data = await apiRequest(`/subtasks/completions?date=${date}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setSubtaskCompletions(data); 
    }
    catch (error) { console.error('Error loading subtask completions:', error); }
  };

  // Permanent Subtasks Functions
  const loadPermanentSubtasks = async (token?: string) => {
    try { 
      console.log('[loadPermanentSubtasks] Loading with token:', token ? 'yes' : 'no');
      const data = await apiRequest('/permanent-subtasks/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      console.log('[loadPermanentSubtasks] Loaded:', data?.length || 0);
      setPermanentSubtasks(data); 
    }
    catch (error) { console.error('Error loading permanent subtasks:', error); }
  };

  const loadPermanentSubtaskCompletions = async (date: string, token?: string) => {
    try { 
      const data = await apiRequest(`/permanent-subtasks/completions?date=${date}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setPermanentSubtaskCompletions(data); 
    }
    catch (error) { console.error('Error loading permanent subtask completions:', error); }
  };

  // Préparation de Commande Functions (Order Preparation)
  const loadSuppliers = async (token?: string) => {
    try { 
      const data = await apiRequest('/suppliers/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setSuppliers(data); 
    }
    catch (error) { console.error('Error loading suppliers:', error); }
  };

  const loadSupplierProducts = async (token?: string) => {
    try { 
      const data = await apiRequest('/supplier-products/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setSupplierProducts(data); 
    }
    catch (error) { console.error('Error loading supplier products:', error); }
  };

  const loadSupplierOrders = async (token?: string) => {
    try { 
      const data = await apiRequest('/supplier-orders/list', { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined }); 
      setSupplierOrders(data); 
    }
    catch (error) { console.error('Error loading supplier orders:', error); }
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

  // Events Functions (Module Événements)
  const loadEvents = async () => {
    try {
      const data = await apiRequest('/events');
      setEvents(data);
    } catch (error) { console.error('Error loading events:', error); }
  };

  const loadEventData = async (eventId: string) => {
    try {
      const [providers, tasks, sections, items, packages, drinks] = await Promise.all([
        apiRequest(`/events/${eventId}/providers`),
        apiRequest(`/events/${eventId}/tasks`),
        apiRequest(`/events/${eventId}/menu/sections`),
        apiRequest(`/events/${eventId}/menu/items`),
        apiRequest(`/events/${eventId}/menu/packages`),
        apiRequest(`/events/${eventId}/menu/drinks`)
      ]);
      setEventProviders(providers);
      setEventTasks(tasks);
      setEventMenuSections(sections);
      setEventMenuItems(items);
      setEventPricePackages(packages);
      setEventDrinkOptions(drinks);
    } catch (error) { console.error('Error loading event data:', error); }
  };

  // Facturation Functions
  const loadInvoices = async () => {
    try {
      const data = await apiRequest('/invoices/list');
      setInvoices(data);
    } catch (error) { console.error('Error loading invoices:', error); }
  };

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
      setTaskTemplates([]);
      setDailyTasks([]);
      setPendingTasks([]);
      setUsers([]);
      setHistory([]);
      setSubtasks([]);
      setSubtaskCompletions([]);
      setPermanentCategories([]);
      setPermanentTasks([]);
      setPermanentSubtasks([]);
      setPermanentSubtaskCompletions([]);
      setMenuSections([]);
      setMenuItems([]);
      setGroupReservations([]);
      setMenuRestaurantSections([]);
      setMenuRestaurantItems([]);
      setMenuRestaurantNotes([]);
      setFicheSections([]);
      setFicheProducts([]);
      setSuppliers([]);
      setSupplierProducts([]);
      setSupplierOrders([]);
      setEvents([]);
      setSelectedEvent(null);
      setEventProviders([]);
      setArdoiseData(null);
      setArdoiseSalesHistory([]);
      setArdoiseReport(null);
      setEventTasks([]);
      setEventMenuSections([]);
      setEventMenuItems([]);
      setEventPricePackages([]);
      setEventDrinkOptions([]);
      setInvoices([]);
      
      // Recharger TOUTES les données du nouveau restaurant
      console.log('[SWITCH] Loading all data for new restaurant...');
      await Promise.all([
        loadCategories(),
        loadDailyTasks(undefined, selectedDate),
        loadTaskTemplates(),
        loadUsers(),
        loadSubtasks(),
        loadSubtaskCompletions(selectedDate),
        loadPermanentSubtasks(),
        loadPermanentSubtaskCompletions(selectedDate),
        loadPermanentCategories(),
        loadPermanentTasks(),
        loadMenuSections(),
        loadMenuItems(),
        loadGroupReservations(),
        loadMenuRestaurantSections(),
        loadMenuRestaurantItems(),
        loadMenuRestaurantNotes(),
        loadFicheSections(),
        loadFicheProducts(),
        loadSuppliers(),
        loadSupplierProducts(),
        loadSupplierOrders(),
        loadEvents(),
        loadInvoices(),
      ]);
      
      console.log('[SWITCH] All data loaded, switching to daily screen');
      // Revenir à l'écran principal
      setCurrentScreen('daily');
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
      await loadDailyTasks(undefined, selectedDate);
      await loadTaskTemplates();
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
    await loadDailyTasks(undefined, selectedDate);
    await loadTaskTemplates();
    await loadUsers();
    await loadSubtasks();
    await loadSubtaskCompletions(selectedDate);
    setRefreshing(false);
  }, [selectedDate]);

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

  // Si un group_token est présent
  if (groupToken) {
    // Si on a choisi de voir la vue staff (après avoir cliqué sur le bouton)
    if (showStaffGroupView) {
      return (
        <StaffGroupViewScreen 
          token={groupToken} 
          onClose={() => { setShowStaffGroupView(false); setGroupToken(null); }}
          primaryColor={restaurant?.primary_color || DEFAULT_PRIMARY}
          secondaryColor={restaurant?.secondary_color || DEFAULT_SECONDARY}
          apiRequest={apiRequest}
        />
      );
    }
    
    // Si l'utilisateur est authentifié (staff/admin), afficher la vue staff directement
    if (sessionToken && user) {
      return (
        <StaffGroupViewScreen 
          token={groupToken} 
          onClose={() => setGroupToken(null)}
          primaryColor={restaurant?.primary_color || DEFAULT_PRIMARY}
          secondaryColor={restaurant?.secondary_color || DEFAULT_SECONDARY}
          apiRequest={apiRequest}
        />
      );
    }
    
    // Sinon, afficher la page client publique (non authentifié) avec option de basculer vers staff
    return (
      <ClientMenuSelectionScreen 
        token={groupToken} 
        onClose={() => setGroupToken(null)}
        onSwitchToStaffView={() => setShowStaffGroupView(true)}
      />
    );
  }

  // Si un publicGroupRequestRestaurantId est présent, afficher le formulaire public de demande de groupe
  if (publicGroupRequestRestaurantId) {
    return <PublicGroupRequestScreen restaurantId={publicGroupRequestRestaurantId} onClose={() => setPublicGroupRequestRestaurantId(null)} />;
  }

  // Si un trackGroupToken est présent, afficher la page de suivi de réservation
  if (trackGroupToken) {
    return <TrackGroupReservationScreen token={trackGroupToken} onClose={() => setTrackGroupToken(null)} />;
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
        loadCategories(token); loadDailyTasks(token, selectedDate); loadTaskTemplates(token); loadUsers(token);
        // Charger les sous-tâches et leurs complétions
        loadSubtasks(token); loadSubtaskCompletions(selectedDate, token);
        // Charger les sous-tâches permanentes
        loadPermanentSubtasks(token); loadPermanentSubtaskCompletions(selectedDate, token);
        // Charger les données pour tous les écrans (Fiche Technique, Menu Restaurant, Events, etc.)
        loadFicheSections(token); loadFicheProducts(token);
        loadMenuRestaurantSections(token); loadMenuRestaurantItems(token); loadMenuRestaurantNotes(token);
        loadEvents(token);
        loadGroupReservations(token);
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
  const isMenuGroupeMode = currentScreen === 'menuGroupe' || currentScreen === 'createGroup';
  const isOrderPrepMode = currentScreen === 'orderPrep';
  
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
    return hasMenuGroupeAccess() || hasPrepCommandeAccess() || hasFicheTechniqueAccess() || hasArdoiseAccess() || hasTachesAccess() || hasMenuRestaurantAccess() || hasEventsAccess() || hasPrestatairesAccess();
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
      bottomBackgroundColor={(currentScreen === 'ficheTechnique' || currentScreen === 'menuRestaurant' || currentScreen === 'menuRestaurantDraft' || currentScreen === 'events' || currentScreen === 'facturation' || currentScreen === 'rapportArdoise' || isMenuGroupeMode || isOrderPrepMode) ? secondaryColor : undefined}
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

        {/* RIGHT: Paramètres (contient Équipe, Historique, Déconnexion) */}
        <View style={styles.headerRight}>
          <TouchableOpacity 
            onPress={() => setShowSettingsDropdown(!showSettingsDropdown)} 
            style={styles.headerIconButton}
            data-testid="settings-dropdown-button"
          >
            <WebIcon name="settings-outline" size={24} color={secondaryColor} />
          </TouchableOpacity>
        </View>
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
              <TouchableOpacity 
                style={styles.settingsDropdownItem} 
                onPress={() => { setShowSettingsDropdown(false); setCurrentScreen('history'); loadHistory(); }}
              >
                <WebIcon name="time-outline" size={20} color={secondaryColor} />
                <Text style={[styles.settingsDropdownText, { color: secondaryColor }]}>Historique</Text>
              </TouchableOpacity>
              {/* [APP-FILTER] Prestataires settings masqué */}
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
          {/* Option Tâches - visible pour admins et staff avec permission tâches */}
          {(user.role === 'admin' || hasTachesAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('daily'); }}
              data-testid="menu-item-tasks"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>📝</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Tâches</Text>
            </TouchableOpacity>
          )}
          {/* Option Préparation de Commande - visible pour admins et staff avec permission */}
          {hasPrepCommandeAccess() && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('orderPrep'); loadSuppliers(); loadSupplierProducts(); loadSupplierOrders(); }}
              data-testid="menu-item-order-prep"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>📦</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Préparation de commande</Text>
            </TouchableOpacity>
          )}
          {/* Option Menu Restaurant - visible pour admins et staff avec permission menu_restaurant */}
          {/* [APP-FILTER] menu-item-menu-restaurant masqué */}
          {/* Option Menu Restaurant en cours (brouillon) - visible pour admins et staff avec permission menu_restaurant_en_cours */}
          {/* [APP-FILTER] menu-item-menu-restaurant-draft masqué */}
          {/* Option Menu Client - visible pour admins et staff avec permission menu_client ou menu_restaurant */}
          {/* [APP-FILTER] menu-item-menu-client masqué */}
          {/* Option Fiche Technique - visible pour admins et staff avec permission fiche_technique */}
          {/* [APP-FILTER] menu-item-fiche-technique masqué */}
          {/* Option Menu Groupe - visible pour admins et staff avec permission menu_groupe */}
          {/* [APP-FILTER] menu-item-groupe masqué */}
          {/* Option Événement - visible pour admins et staff avec permission événements */}
          {/* [APP-FILTER] menu-item-events masqué */}
          {/* Option Facturation - visible pour admins et staff avec permission facturation */}
          {/* [APP-FILTER] menu-item-facturation masqué */}
          {/* Option Rapport Ardoise - visible pour admins et staff avec permission ardoise */}
          {/* [APP-FILTER] menu-item-rapport-ardoise masqué */}
          {/* Option Prestataires - visible pour admins et staff avec permission prestataires */}
          {/* [APP-FILTER] menu-item-prestataires masqué */}
        </View>
      )}

      <View style={[
        styles.content, 
        { backgroundColor: secondaryColor },
        // Ajouter du padding en bas si la barre de navigation fixe est présente (sur web)
        Platform.OS === 'web' && !isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && {
          paddingBottom: 80
        },
        // Étendre jusqu'en bas si pas de barre de navigation (réduit le padding sur web)
        (currentScreen === 'ficheTechnique' || currentScreen === 'menuRestaurant' || currentScreen === 'menuRestaurantDraft' || currentScreen === 'events' || currentScreen === 'facturation' || currentScreen === 'rapportArdoise' || isMenuGroupeMode || isOrderPrepMode) && { 
          borderBottomLeftRadius: 0, 
          borderBottomRightRadius: 0,
          paddingBottom: 0
        }
      ]} data-testid="main-content">
        {currentScreen === 'daily' && (
          <DailyTasksScreen key={`daily-${restaurant?.restaurant_id}`} tasks={dailyTasks} categories={categories} selectedDate={selectedDate}
            setSelectedDate={(date) => { setSelectedDate(date); loadDailyTasks(undefined, date); loadSubtaskCompletions(date); loadPermanentSubtaskCompletions(date); }}
            onRefresh={onRefresh} refreshing={refreshing} user={user} primaryColor={primaryColor}
            secondaryColor={secondaryColor} apiRequest={apiRequest} 
            loadTasks={() => { loadDailyTasks(undefined, selectedDate); loadSubtaskCompletions(selectedDate); loadPermanentSubtaskCompletions(selectedDate); }}
            subtasks={subtasks} subtaskCompletions={subtaskCompletions}
            permanentSubtasks={permanentSubtasks} permanentSubtaskCompletions={permanentSubtaskCompletions}
            canAddTaches={canAddTaches()} canEditTaches={canEditTaches()} canDeleteTaches={canDeleteTaches()} />
        )}
        {currentScreen === 'prepare' && (
          <PrepareTasksScreen key={`prepare-${restaurant?.restaurant_id}`} templates={taskTemplates} pendingTasks={pendingTasks} categories={categories}
            prepareDate={prepareDate} setPrepareDate={(date) => { setPrepareDate(date); loadPendingTasks(date); }}
            primaryColor={primaryColor} secondaryColor={secondaryColor} apiRequest={apiRequest}
            loadPendingTasks={() => loadPendingTasks()} users={users} user={user}
            canAddTaches={canAddTaches()} canEditTaches={canEditTaches()} canDeleteTaches={canDeleteTaches()} />
        )}
        {currentScreen === 'templates' && (user.role === 'admin' || canAddTacheModeles() || canEditTacheModeles() || canDeleteTacheModeles()) && (
          <TaskTemplatesScreen key={`templates-${restaurant?.restaurant_id}`} templates={taskTemplates} categories={categories} primaryColor={primaryColor}
            secondaryColor={secondaryColor} apiRequest={apiRequest} loadTemplates={() => loadTaskTemplates()}
            canAddModeles={canAddTacheModeles()} canEditModeles={canEditTacheModeles()} canDeleteModeles={canDeleteTacheModeles()} user={user} />
        )}
        {currentScreen === 'categories' && (user.role === 'admin' || (canAddTaches() && canEditTaches() && canDeleteTaches())) && (
          <CategoriesScreen key={`categories-${restaurant?.restaurant_id}`} categories={categories} primaryColor={primaryColor} secondaryColor={secondaryColor}
            apiRequest={apiRequest} loadCategories={() => loadCategories()} user={user}
            canAddCategory={canAddTaches()} canEditCategory={canEditTaches()} canDeleteCategory={canDeleteTaches()} />
        )}
        {currentScreen === 'users' && user.role === 'admin' && (
          <UsersScreen key={`users-${restaurant?.restaurant_id}`} users={users} categories={categories} primaryColor={primaryColor}
            secondaryColor={secondaryColor} apiRequest={apiRequest} loadUsers={() => loadUsers()} allRestaurants={allRestaurants} />
        )}
        {currentScreen === 'history' && (
          <HistoryScreen key={`history-${restaurant?.restaurant_id}`} history={history} tasks={dailyTasks} selectedDate={selectedDate}
            setSelectedDate={(date) => { setSelectedDate(date); loadDailyTasks(undefined, date); loadHistory(); }}
            primaryColor={primaryColor} secondaryColor={secondaryColor} onRefresh={loadHistory} />
        )}
        {currentScreen === 'prestataires' && (user.role === 'admin' || hasPrestatairesAccess()) && (
          <PrestatairesScreen 
            key={`prestataires-${restaurant?.restaurant_id}`}
            prestataires={prestataires}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            apiRequest={apiRequest}
            loadPrestataires={loadPrestataires}
          />
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
        {currentScreen === 'menuGroupe' && hasMenuGroupeAccess() && (
          <MenuGroupeScreen 
            key={`menuGroupe-${restaurant?.restaurant_id}`}
            sections={menuSections} 
            items={menuItems} 
            reservations={groupReservations}
            primaryColor={primaryColor} 
            secondaryColor={secondaryColor} 
            apiRequest={apiRequest}
            loadSections={loadMenuSections}
            loadItems={loadMenuItems}
            loadReservations={loadGroupReservations}
            onCreateGroup={() => setCurrentScreen('createGroup')}
            restaurant={restaurant}
            sessionToken={sessionToken}
            isAdmin={user.role === 'admin'}
          />
        )}
        {currentScreen === 'createGroup' && hasMenuGroupeAccess() && (
          <CreateGroupScreen 
            key={`createGroup-${restaurant?.restaurant_id}`}
            sections={menuSections} 
            items={menuItems}
            primaryColor={primaryColor} 
            secondaryColor={secondaryColor} 
            apiRequest={apiRequest}
            onBack={() => { setCurrentScreen('menuGroupe'); loadGroupReservations(); }}
            restaurant={restaurant}
          />
        )}
        {currentScreen === 'permanentTasks' && user.role === 'admin' && (
          <PermanentTasksScreen 
            key={`permanentTasks-${restaurant?.restaurant_id}`}
            permanentCategories={permanentCategories}
            permanentTasks={permanentTasks}
            primaryColor={primaryColor} 
            secondaryColor={secondaryColor} 
            apiRequest={apiRequest}
            loadCategories={loadPermanentCategories}
            loadTasks={loadPermanentTasks}
          />
        )}
        {currentScreen === 'orderPrep' && (
          <OrderPreparationScreen 
            key={`orderPrep-${restaurant?.restaurant_id}`}
            suppliers={suppliers}
            products={supplierProducts}
            orders={supplierOrders}
            primaryColor={primaryColor} 
            secondaryColor={secondaryColor} 
            apiRequest={apiRequest}
            loadSuppliers={loadSuppliers}
            loadProducts={loadSupplierProducts}
            loadOrders={loadSupplierOrders}
            isAdmin={user.role === 'admin'}
            sessionToken={sessionToken}
            userPrepPermissions={user.detailed_permissions?.preparation_commande || {}}
          />
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
        {currentScreen === 'events' && hasEventsAccess() && (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <EventsScreen
              key={`events-${restaurant?.restaurant_id}`}
              events={events}
              selectedEvent={selectedEvent}
              setSelectedEvent={setSelectedEvent}
              providers={eventProviders}
              tasks={eventTasks}
              menuSections={eventMenuSections}
              menuItems={eventMenuItems}
              pricePackages={eventPricePackages}
              drinkOptions={eventDrinkOptions}
              users={users}
              prestataires={prestataires}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              apiRequest={apiRequest}
              loadEvents={loadEvents}
              loadEventData={loadEventData}
              loadPrestataires={loadPrestataires}
              allRestaurants={allRestaurants}
              restaurant={restaurant}
              setShowRestaurantPicker={setShowRestaurantPicker}
              isAdmin={user?.role === 'admin'}
              userPermissions={user?.detailed_permissions}
            />
          </View>
        )}
        {currentScreen === 'facturation' && (user.role === 'admin' || hasFacturationAccess()) && (
          <FacturationScreen
            key={`facturation-${restaurant?.restaurant_id}`}
            invoices={invoices}
            menuRestaurantSections={menuRestaurantSections}
            menuRestaurantItems={menuRestaurantItems}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            apiRequest={apiRequest}
            loadInvoices={loadInvoices}
            restaurant={restaurant}
            loadMenuRestaurantSections={loadMenuRestaurantSections}
            loadMenuRestaurantItems={loadMenuRestaurantItems}
          />
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
            onBack={() => setCurrentScreen('daily')}
          />
        )}
      </View>

      {/* Bottom navigation - visible uniquement sur les écrans principaux de tâches */}
      {!isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && (
        <View 
          style={[
            styles.bottomNav, 
            { backgroundColor: primaryColor },
            Platform.OS === 'web' && {
              position: 'fixed' as any,
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
              paddingBottom: 34, // Hauteur approximative de la safe area iOS
            }
          ]} 
          data-testid="bottom-nav"
        >
          <TouchableOpacity style={styles.navItem} onPress={() => { setCurrentScreen('daily'); loadDailyTasks(undefined, selectedDate); }} data-testid="nav-tasks">
            <WebIcon name={currentScreen === 'daily' ? 'today' : 'today-outline'} size={26} color={currentScreen === 'daily' ? secondaryColor : '#888'} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => { setCurrentScreen('prepare'); loadPendingTasks(); loadUsers(); }} data-testid="nav-prepare">
            <WebIcon name={currentScreen === 'prepare' ? 'send' : 'send-outline'} size={26} color={currentScreen === 'prepare' ? secondaryColor : '#888'} />
          </TouchableOpacity>

          {(user.role === 'admin' || canAddTacheModeles() || canEditTacheModeles() || canDeleteTacheModeles()) && (
            <TouchableOpacity style={styles.navItem} onPress={() => setCurrentScreen('templates')} data-testid="nav-templates">
              <WebIcon name={currentScreen === 'templates' ? 'list' : 'list-outline'} size={26} color={currentScreen === 'templates' ? secondaryColor : '#888'} />
            </TouchableOpacity>
          )}

          {/* Categories for admin or staff with full permissions, History for others */}
          {(user.role === 'admin' || (canAddTaches() && canEditTaches() && canDeleteTaches())) ? (
            <TouchableOpacity style={styles.navItem} onPress={() => setCurrentScreen('categories')} data-testid="nav-categories">
              <WebIcon name={currentScreen === 'categories' ? 'grid' : 'grid-outline'} size={26} color={currentScreen === 'categories' ? secondaryColor : '#888'} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.navItem} onPress={() => { setCurrentScreen('history'); loadHistory(); }} data-testid="nav-history">
              <WebIcon name={currentScreen === 'history' ? 'time' : 'time-outline'} size={26} color={currentScreen === 'history' ? secondaryColor : '#888'} />
            </TouchableOpacity>
          )}
        </View>
      )}

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

// ==================== DAILY TASKS SCREEN ====================
function DailyTasksScreen({ tasks, categories, selectedDate, setSelectedDate, onRefresh, refreshing, user, primaryColor, secondaryColor, apiRequest, loadTasks, subtasks, subtaskCompletions, permanentSubtasks: propPermanentSubtasks, permanentSubtaskCompletions, canAddTaches = false, canEditTaches = false, canDeleteTaches = false }: any) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [quantityModal, setQuantityModal] = useState<{visible: boolean; subtask: Subtask | null; quantity: string}>({visible: false, subtask: null, quantity: ''});
  const [localPermanentSubtasks, setLocalPermanentSubtasks] = useState<any[]>([]);
  
  // Charger les sous-tâches permanentes localement si non fournies
  useEffect(() => {
    const loadLocalPermanentSubtasks = async () => {
      if (!propPermanentSubtasks || propPermanentSubtasks.length === 0) {
        try {
          console.log('[DailyTasksScreen] Loading permanent subtasks locally...');
          const data = await apiRequest('/permanent-subtasks/list');
          console.log('[DailyTasksScreen] Loaded permanent subtasks:', data?.length || 0);
          setLocalPermanentSubtasks(data || []);
        } catch (error) {
          console.error('Error loading permanent subtasks:', error);
        }
      }
    };
    loadLocalPermanentSubtasks();
  }, [propPermanentSubtasks, apiRequest]);
  
  // Utiliser les sous-tâches permanentes des props si disponibles, sinon locales
  const permanentSubtasks = (propPermanentSubtasks && propPermanentSubtasks.length > 0) 
    ? propPermanentSubtasks 
    : localPermanentSubtasks;
  
  // Debug log pour les sous-tâches
  useEffect(() => {
    console.log('[DailyTasksScreen] subtasks received:', subtasks?.length || 0);
    console.log('[DailyTasksScreen] subtaskCompletions received:', subtaskCompletions?.length || 0);
    console.log('[DailyTasksScreen] permanentSubtasks received:', permanentSubtasks?.length || 0);
  }, [subtasks, subtaskCompletions, permanentSubtasks]);
  
  // Séparer les tâches régulières et permanentes
  const regularTasks = tasks.filter((t: DailyTask) => !t.is_permanent);
  const permanentTasks = tasks.filter((t: DailyTask) => t.is_permanent === true);
  
  // Filtrer par catégorie pour les tâches régulières
  const filteredRegularTasks = regularTasks.filter((t: DailyTask) => !selectedCategory || t.category_id === selectedCategory);
  
  // Grouper les tâches régulières par catégorie
  const tasksByCategory: Record<string, DailyTask[]> = {};
  filteredRegularTasks.forEach((task: DailyTask) => { 
    const catId = task.category_id || 'unknown';
    if (!tasksByCategory[catId]) tasksByCategory[catId] = []; 
    tasksByCategory[catId].push(task); 
  });
  
  // Grouper les tâches permanentes par catégorie permanente
  const permanentTasksByCategory: Record<string, DailyTask[]> = {};
  permanentTasks.forEach((task: DailyTask) => { 
    const catId = task.permanent_category_id || 'unknown';
    if (!permanentTasksByCategory[catId]) permanentTasksByCategory[catId] = []; 
    permanentTasksByCategory[catId].push(task); 
  });

  // Helper pour récupérer les sous-tâches d'une tâche
  const getSubtasksForTask = (task: DailyTask): Subtask[] => {
    // Pour les tâches régulières, chercher par template_id
    if (!task.is_permanent && subtasks && task.template_id) {
      return subtasks.filter((s: Subtask) => s.parent_template_id === task.template_id);
    }
    // Pour les tâches permanentes, chercher par permanent_task_id
    if (task.is_permanent && permanentSubtasks && task.permanent_task_id) {
      return permanentSubtasks.filter((s: any) => s.parent_permanent_task_id === task.permanent_task_id);
    }
    return [];
  };

  // Helper pour vérifier si une sous-tâche est complétée
  const isSubtaskCompleted = (subtaskId: string): boolean => {
    if (!subtaskCompletions) return false;
    return subtaskCompletions.some((c: any) => c.subtask_id === subtaskId);
  };

  // Toggle expand/collapse d'une tâche
  const toggleTaskExpand = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  };

  // Compléter une sous-tâche avec quantité
  const completeSubtask = async (subtask: Subtask, quantity?: number) => {
    try {
      await apiRequest(`/subtasks/${subtask.subtask_id}/complete?date=${selectedDate}`, { method: 'PUT' });
      loadTasks();
    } catch (error) {
      Platform.OS === 'web' ? alert('Erreur lors de la complétion de la sous-tâche') : showAlert('Erreur', 'Impossible de compléter la sous-tâche');
    }
  };

  // Décompléter une sous-tâche
  const uncompleteSubtask = async (subtask: Subtask) => {
    try {
      await apiRequest(`/subtasks/${subtask.subtask_id}/uncomplete?date=${selectedDate}`, { method: 'PUT' });
      loadTasks();
    } catch (error) {
      Platform.OS === 'web' ? alert('Erreur lors de la modification de la sous-tâche') : showAlert('Erreur', 'Impossible de modifier la sous-tâche');
    }
  };

  // Mettre à jour la quantité d'une sous-tâche directement
  const updateSubtaskQuantity = async (subtask: any, newQuantity: number, isPermanent: boolean = false) => {
    try {
      if (isPermanent) {
        // Utiliser l'endpoint des sous-tâches permanentes
        await apiRequest(`/permanent-subtasks/${subtask.subtask_id}/update-quantity?date=${selectedDate}&quantity=${newQuantity}`, { 
          method: 'PUT'
        });
      } else {
        // Utiliser l'endpoint des sous-tâches normales
        await apiRequest(`/subtasks/${subtask.subtask_id}/complete?date=${selectedDate}`, { 
          method: 'PUT',
          body: JSON.stringify({ quantity: newQuantity })
        });
      }
      // Recharger les complétions de sous-tâches
      loadTasks();
    } catch (error) {
      Platform.OS === 'web' ? alert('Erreur lors de la modification de la quantité') : showAlert('Erreur', 'Impossible de modifier la quantité');
    }
  };

  // Ouvrir le modal de quantité pour une sous-tâche
  const openQuantityModal = (subtask: Subtask) => {
    setQuantityModal({ visible: true, subtask, quantity: '' });
  };

  // Confirmer la complétion avec quantité
  const confirmSubtaskCompletion = async () => {
    if (quantityModal.subtask) {
      const qty = quantityModal.quantity ? parseInt(quantityModal.quantity) : undefined;
      await completeSubtask(quantityModal.subtask, qty);
    }
    setQuantityModal({ visible: false, subtask: null, quantity: '' });
  };

  const toggleTaskStatus = async (task: DailyTask) => {
    try {
      // Les tâches avec un task_id commençant par "task_" sont des tâches envoyées dans mep_daily_tasks
      // Elles utilisent l'endpoint /daily-tasks/{task_id}/complete
      const isRealDailyTask = task.task_id && task.task_id.startsWith('task_');
      
      if (isRealDailyTask) {
        // Tâche envoyée (mep_daily_tasks) - utiliser l'endpoint daily-tasks
        if (task.status === 'completed') {
          await apiRequest(`/daily-tasks/${task.task_id}/uncomplete`, { method: 'PUT' });
        } else {
          await apiRequest(`/daily-tasks/${task.task_id}/complete`, { method: 'PUT' });
        }
      } else if (task.is_permanent && task.template_id) {
        // Tâche permanente dynamique (générée à la volée) - utiliser l'endpoint recurring-tasks
        if (task.status === 'completed') {
          await apiRequest(`/recurring-tasks/${task.template_id}/uncomplete?date=${selectedDate}`, { method: 'PUT' });
        } else {
          await apiRequest(`/recurring-tasks/${task.template_id}/complete?date=${selectedDate}`, { method: 'PUT' });
        }
      } else {
        console.error('Impossible de déterminer le type de tâche:', task);
        Platform.OS === 'web' ? alert('Erreur: type de tâche inconnu') : showAlert('Erreur', 'Type de tâche inconnu');
        return;
      }
      loadTasks();
    } catch (error) { 
      Platform.OS === 'web' ? alert('Impossible de modifier la tâche') : showAlert('Erreur', 'Impossible de modifier la tâche'); 
    }
  };

  const getCategoryName = (categoryId: string) => categories.find((c: Category) => c.category_id === categoryId)?.name || 'Sans catégorie';
  
  // Calculer la progression sur toutes les tâches (régulières + permanentes)
  const allTasks = [...filteredRegularTasks, ...permanentTasks];
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t: DailyTask) => t.status === 'completed').length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <View style={styles.screenContainer}>
      <View style={styles.dateSelector}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setSelectedDate(addDays(selectedDate, -1))}><WebIcon name="chevron-back" size={24} color={primaryColor} /></TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Text style={[styles.dateText, { color: primaryColor }]}>{formatDate(selectedDate)}</Text>
          {selectedDate === getTodayDate() && <Text style={[styles.todayBadge, { backgroundColor: primaryColor, color: secondaryColor }]}>Aujourd'hui</Text>}
        </View>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setSelectedDate(addDays(selectedDate, 1))}><WebIcon name="chevron-forward" size={24} color={primaryColor} /></TouchableOpacity>
      </View>
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressText, { color: primaryColor }]}>{completedTasks} / {totalTasks} tâches</Text>
          <Text style={[styles.progressPercent, { color: primaryColor }]}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: primaryColor }]} /></View>
      </View>
      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryFilter}>
          <TouchableOpacity style={[styles.categoryChip, !selectedCategory && { backgroundColor: primaryColor }]} onPress={() => setSelectedCategory(null)}>
            <Text style={[styles.categoryChipText, { color: !selectedCategory ? secondaryColor : primaryColor }]}>Toutes</Text>
          </TouchableOpacity>
          {categories.map((category: Category) => (
            <TouchableOpacity key={category.category_id} style={[styles.categoryChip, selectedCategory === category.category_id && { backgroundColor: primaryColor }]} onPress={() => setSelectedCategory(category.category_id)}>
              <Text style={[styles.categoryChipText, { color: selectedCategory === category.category_id ? secondaryColor : primaryColor }]}>{category.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <ScrollView style={styles.tasksList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Tâches permanentes - toujours affichées en premier */}
        {Object.keys(permanentTasksByCategory).length > 0 && (
          <>
            {Object.entries(permanentTasksByCategory).map(([categoryId, categoryTasks]) => (
              <View key={`permanent-${categoryId}`} style={styles.categorySection}>
                <View style={styles.permanentCategoryHeader}>
                  <WebIcon name="repeat" size={16} color={primaryColor} />
                  <Text style={[styles.categorySectionTitle, { color: primaryColor, marginLeft: 6 }]}>
                    {(categoryTasks as DailyTask[])[0]?.permanent_category_name || 'Permanent'}
                  </Text>
                </View>
                {(categoryTasks as DailyTask[]).map((task: DailyTask) => {
                  const taskSubtasks = getSubtasksForTask(task);
                  const isExpanded = expandedTasks.has(task.task_id);
                  const hasSubtasks = taskSubtasks.length > 0;
                  
                  return (
                    <View key={task.task_id}>
                      <TouchableOpacity 
                        style={[styles.taskItem, task.status === 'completed' && styles.taskCompleted, styles.permanentTaskItemBorder]} 
                        onPress={() => toggleTaskStatus(task)}
                        data-testid={`permanent-task-${task.permanent_task_id}`}
                      >
                        <View style={[styles.taskCheckbox, { borderColor: '#1A3A5C' }]}>
                          {task.status === 'completed' && <WebIcon name="checkmark" size={18} color="#1A3A5C" />}
                        </View>
                        <View style={styles.taskContent}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.taskTitle, task.status === 'completed' && styles.taskTitleCompleted]}>{task.title}</Text>
                            {hasSubtasks && (
                              <Pressable 
                                onPress={(e) => { e.stopPropagation(); toggleTaskExpand(task.task_id); }}
                                style={{ backgroundColor: '#4CAF5020', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, cursor: 'pointer' } as any}
                              >
                                <Text style={{ color: '#4CAF50', fontSize: 11 }}>
                                  {taskSubtasks.length} sous-tâche{taskSubtasks.length > 1 ? 's' : ''} {isExpanded ? '[-]' : '[+]'}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                          {task.description && <Text style={styles.taskDescription}>{task.description}</Text>}
                        </View>
                      </TouchableOpacity>
                      
                      {/* Sous-tâches pour tâches permanentes */}
                      {isExpanded && hasSubtasks && (
                        <View style={{ marginLeft: 24, marginTop: 4, marginBottom: 8 }}>
                          {taskSubtasks.map((subtask: any) => {
                            // Pour les tâches permanentes, utiliser permanentSubtaskCompletions
                            const completion = permanentSubtaskCompletions?.find((c: any) => c.subtask_id === subtask.subtask_id);
                            const currentQty = completion?.quantity || subtask.quantity || 0;
                            return (
                              <View 
                                key={subtask.subtask_id} 
                                style={{ 
                                  flexDirection: 'row', 
                                  alignItems: 'center', 
                                  paddingVertical: 10, 
                                  paddingHorizontal: 12, 
                                  backgroundColor: '#f8f9fa', 
                                  borderRadius: 6, 
                                  marginBottom: 4,
                                  borderLeftWidth: 3,
                                  borderLeftColor: '#1A3A5C'
                                }}
                                data-testid={`subtask-${subtask.subtask_id}`}
                              >
                                <Text style={{ flex: 1, fontSize: 14, color: '#333' }}>
                                  ↳ {subtask.name}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }}>
                                  <Pressable 
                                    onPress={() => updateSubtaskQuantity(subtask, Math.max(0, currentQty - 1), true)}
                                    style={{ padding: 8, borderRightWidth: 1, borderRightColor: '#ddd', cursor: 'pointer' } as any}
                                  >
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1A3A5C' }}>−</Text>
                                  </Pressable>
                                  <Text style={{ minWidth: 32, textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#333' }}>{currentQty}</Text>
                                  <Pressable 
                                    onPress={() => updateSubtaskQuantity(subtask, currentQty + 1, true)}
                                    style={{ padding: 8, borderLeftWidth: 1, borderLeftColor: '#ddd', cursor: 'pointer' } as any}
                                  >
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1A3A5C' }}>+</Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}
        
        {/* Tâches régulières */}
        {Object.keys(tasksByCategory).length === 0 && Object.keys(permanentTasksByCategory).length === 0 ? (
          <View style={styles.emptyState}>
            <WebIcon name="clipboard-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateText}>Aucune tâche pour cette date</Text>
            <Text style={styles.emptyStateSubtext}>Les tâches apparaîtront ici quand elles seront envoyées</Text>
          </View>
        ) : (
          Object.entries(tasksByCategory).map(([categoryId, categoryTasks]) => (
            <View key={categoryId} style={styles.categorySection}>
              <Text style={[styles.categorySectionTitle, { color: primaryColor }]}>{getCategoryName(categoryId)}</Text>
              {(categoryTasks as DailyTask[]).map((task: DailyTask) => {
                const taskSubtasks = getSubtasksForTask(task);
                const isExpanded = expandedTasks.has(task.task_id);
                const hasSubtasks = taskSubtasks.length > 0;
                
                return (
                  <View key={task.task_id}>
                    <Pressable 
                      style={[styles.taskItem, task.status === 'completed' && styles.taskCompleted, Platform.OS === 'web' && { cursor: 'pointer' }]} 
                      onPress={() => toggleTaskStatus(task)}
                      data-testid={`task-${task.task_id}`}
                    >
                      <View style={[styles.taskCheckbox, { borderColor: '#1A3A5C' }]}>
                        {task.status === 'completed' && <Text style={{ fontSize: 16, color: '#1A3A5C' }}>✓</Text>}
                      </View>
                      <View style={styles.taskContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.taskTitle, task.status === 'completed' && styles.taskTitleCompleted]}>{task.title}</Text>
                          {hasSubtasks && (
                            <Pressable 
                              onPress={(e) => { e.stopPropagation(); toggleTaskExpand(task.task_id); }}
                              style={{ backgroundColor: '#4CAF5020', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, cursor: 'pointer' } as any}
                            >
                              <Text style={{ color: '#4CAF50', fontSize: 11 }}>
                                {taskSubtasks.length} sous-tâche{taskSubtasks.length > 1 ? 's' : ''} {isExpanded ? '[-]' : '[+]'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        {task.description && <Text style={styles.taskDescription}>{task.description}</Text>}
                        {task.assigned_user_name && <Text style={[styles.taskAssigned, { color: primaryColor }]}>👤 {task.assigned_user_name}</Text>}
                        {!task.is_recurring && <Text style={styles.taskBadge}>Ponctuelle</Text>}
                      </View>
                    </Pressable>
                    
                    {/* Sous-tâches expansées - Nouvelle UI sans checkbox, quantité inline */}
                    {isExpanded && hasSubtasks && (
                      <View style={{ marginLeft: 24, marginTop: 4, marginBottom: 8 }}>
                        {taskSubtasks.map((subtask: Subtask) => {
                          const completion = subtaskCompletions.find((c: any) => c.subtask_id === subtask.subtask_id);
                          const currentQty = completion?.quantity || subtask.quantity || 0;
                          return (
                            <View 
                              key={subtask.subtask_id} 
                              style={{ 
                                flexDirection: 'row', 
                                alignItems: 'center', 
                                paddingVertical: 10, 
                                paddingHorizontal: 12, 
                                backgroundColor: '#f8f9fa', 
                                borderRadius: 6, 
                                marginBottom: 4,
                                borderLeftWidth: 3,
                                borderLeftColor: '#1A3A5C'
                              }}
                              data-testid={`subtask-${subtask.subtask_id}`}
                            >
                              <Text style={{ flex: 1, fontSize: 14, color: '#333' }}>
                                ↳ {subtask.name}
                              </Text>
                              {/* Boutons quantité +/- inline */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }}>
                                <Pressable 
                                  onPress={() => updateSubtaskQuantity(subtask, Math.max(0, currentQty - 1))}
                                  style={{ padding: 8, borderRightWidth: 1, borderRightColor: '#ddd', cursor: 'pointer' } as any}
                                  data-testid={`subtask-minus-${subtask.subtask_id}`}
                                >
                                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1A3A5C' }}>−</Text>
                                </Pressable>
                                <Text style={{ minWidth: 32, textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#333' }}>{currentQty}</Text>
                                <Pressable 
                                  onPress={() => updateSubtaskQuantity(subtask, currentQty + 1)}
                                  style={{ padding: 8, borderLeftWidth: 1, borderLeftColor: '#ddd', cursor: 'pointer' } as any}
                                  data-testid={`subtask-plus-${subtask.subtask_id}`}
                                >
                                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1A3A5C' }}>+</Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
      
      {/* Modal de quantité pour sous-tâches */}
      <Modal visible={quantityModal.visible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 300, padding: 20 }]}>
            <Text style={[styles.modalTitle, { color: primaryColor, marginBottom: 16 }]}>Quantité réalisée</Text>
            <Text style={{ color: primaryColor, marginBottom: 12 }}>
              Sous-tâche: {quantityModal.subtask?.name}
            </Text>
            <TextInput 
              style={[styles.modalInput, { borderColor: primaryColor, marginBottom: 16 }]} 
              placeholder="Quantité (optionnel)" 
              keyboardType="numeric"
              value={quantityModal.quantity} 
              onChangeText={(text) => setQuantityModal(prev => ({...prev, quantity: text}))}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8, alignItems: 'center' }}
                onPress={() => setQuantityModal({ visible: false, subtask: null, quantity: '' })}
              >
                <Text style={{ color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 12, backgroundColor: primaryColor, borderRadius: 8, alignItems: 'center' }}
                onPress={confirmSubtaskCompletion}
              >
                <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== PREPARE TASKS SCREEN ====================
function PrepareTasksScreen({ templates, pendingTasks, categories, prepareDate, setPrepareDate, primaryColor, secondaryColor, apiRequest, loadPendingTasks, users, user, canAddTaches = false, canEditTaches = false, canDeleteTaches = false }: any) {
  const [selectedTemplates, setSelectedTemplates] = useState<Map<string, { selected: boolean; assignedUserId: string | null }>>(new Map());
  const [showPunctualModal, setShowPunctualModal] = useState(false);
  const [punctualTitle, setPunctualTitle] = useState('');
  const [punctualDescription, setPunctualDescription] = useState('');
  const [punctualCategory, setPunctualCategory] = useState('');
  const [punctualAssignedUser, setPunctualAssignedUser] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);

  const alreadySelectedIds = new Set(pendingTasks.filter((t: DailyTask) => t.template_id).map((t: DailyTask) => t.template_id));
  const staffUsers = (users || []).filter((u: User) => u.role === 'staff');

  const templatesByCategory: Record<string, TaskTemplate[]> = {};
  templates.forEach((template: TaskTemplate) => {
    if (!templatesByCategory[template.category_id]) templatesByCategory[template.category_id] = [];
    templatesByCategory[template.category_id].push(template);
  });

  const getCategoryName = (categoryId: string) => categories.find((c: Category) => c.category_id === categoryId)?.name || 'Sans catégorie';
  const getUsersForCategory = (categoryId: string) => staffUsers.filter((u: User) => (u.assigned_categories || []).includes(categoryId));

  const toggleTemplate = (templateId: string) => {
    const newSelected = new Map(selectedTemplates);
    const current = newSelected.get(templateId);
    if (current?.selected) {
      newSelected.delete(templateId);
    } else {
      newSelected.set(templateId, { selected: true, assignedUserId: null });
    }
    setSelectedTemplates(newSelected);
  };

  const assignUserToTemplate = (templateId: string, userId: string | null) => {
    const newSelected = new Map(selectedTemplates);
    newSelected.set(templateId, { selected: true, assignedUserId: userId });
    setSelectedTemplates(newSelected);
    setShowAssignModal(null);
  };

  const selectTemplates = async () => {
    const selectionsToAdd = Array.from(selectedTemplates.entries()).filter(([_, v]) => v.selected);
    if (selectionsToAdd.length === 0) { showAlert('Erreur', 'Veuillez sélectionner au moins une tâche'); return; }
    try {
      const selections = selectionsToAdd.map(([templateId, data]) => ({ template_id: templateId, assigned_user_id: data.assignedUserId }));
      await apiRequest('/daily-tasks/select', { method: 'POST', body: JSON.stringify({ date: prepareDate, selections }) });
      setSelectedTemplates(new Map());
      loadPendingTasks();
      showAlert('Succès', 'Tâches ajoutées à la liste');
    } catch (error: any) { showAlert('Erreur', error.message || 'Impossible d\'ajouter les tâches'); }
  };

  const addPunctualTask = async () => {
    if (!punctualTitle || !punctualCategory) { showAlert('Erreur', 'Veuillez remplir les champs requis'); return; }
    try {
      await apiRequest('/daily-tasks/create-punctual', { method: 'POST', body: JSON.stringify({ title: punctualTitle, description: punctualDescription || null, category_id: punctualCategory, date: prepareDate, assigned_user_id: punctualAssignedUser }) });
      setShowPunctualModal(false); setPunctualTitle(''); setPunctualDescription(''); setPunctualCategory(''); setPunctualAssignedUser(null);
      loadPendingTasks();
    } catch (error: any) { showAlert('Erreur', error.message || 'Impossible d\'ajouter la tâche'); }
  };

  const sendTasks = async () => {
    console.log('sendTasks called, pendingTasks:', pendingTasks.length);
    if (pendingTasks.length === 0) { 
      if (Platform.OS === 'web') {
        alert('Aucune tâche à envoyer');
      } else {
        showAlert('Erreur', 'Aucune tâche à envoyer'); 
      }
      return; 
    }
    
    // Set loading immediately to give visual feedback
    setIsSending(true);
    
    try {
      console.log('Sending tasks for date:', prepareDate);
      const result = await apiRequest('/daily-tasks/send', { 
        method: 'POST', 
        body: JSON.stringify({ date: prepareDate }) 
      });
      console.log('Send result:', result);
      
      // Show success message
      const successMsg = `✅ ${result.tasks_sent} tâches envoyées à ${result.users_notified} personne(s) !`;
      if (Platform.OS === 'web') {
        alert(successMsg);
      } else {
        showAlert('Envoyé !', successMsg);
      }
      
      // Reload to show empty state
      loadPendingTasks();
    } catch (error: any) { 
      console.error('Send error:', error);
      const errorMsg = error.message || 'Impossible d\'envoyer';
      if (Platform.OS === 'web') {
        alert('Erreur: ' + errorMsg);
      } else {
        showAlert('Erreur', errorMsg);
      }
    } finally { 
      setIsSending(false); 
    }
  };

  const removePendingTask = async (taskId: string) => {
    try { await apiRequest(`/daily-tasks/${taskId}`, { method: 'DELETE' }); loadPendingTasks(); }
    catch (error) { showAlert('Erreur', 'Impossible de supprimer'); }
  };

  return (
    <View style={styles.screenContainer}>
      <Text style={[styles.screenTitle, { color: primaryColor }]}>Préparer les tâches</Text>
      <View style={styles.dateSelector}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setPrepareDate(addDays(prepareDate, -1))}><WebIcon name="chevron-back" size={24} color={primaryColor} /></TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Text style={[styles.dateText, { color: primaryColor }]}>{formatDate(prepareDate)}</Text>
          {prepareDate === getTomorrowDate() && <Text style={[styles.todayBadge, { backgroundColor: primaryColor, color: secondaryColor }]}>Demain</Text>}
        </View>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setPrepareDate(addDays(prepareDate, 1))}><WebIcon name="chevron-forward" size={24} color={primaryColor} /></TouchableOpacity>
      </View>

      {/* Send button - Outside ScrollView for better touch handling */}
      {pendingTasks.length > 0 && (
        <View style={[styles.sendButtonContainer, { backgroundColor: primaryColor }]}>
          <Text style={[styles.pendingCountText, { color: secondaryColor }]}>
            {pendingTasks.length} tâche{pendingTasks.length > 1 ? 's' : ''} à envoyer
          </Text>
          {Platform.OS === 'web' ? (
            <button
              onClick={() => {
                console.log('=== WEB BUTTON CLICKED ===');
                alert('Bouton cliqué !');
                if (!isSending) {
                  sendTasks();
                }
              }}
              disabled={isSending}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: 25,
                padding: '14px 20px',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: 'pointer',
                minWidth: 160,
              }}
            >
              <WebIcon name="send" size={20} color="white" style={{ marginRight: 8 }} />
              Envoyer les tâches
            </button>
          ) : (
            <TouchableOpacity 
              style={[styles.sendButtonLarge, { backgroundColor: '#4CAF50' }]}
              onPress={() => {
                console.log('=== NATIVE BUTTON PRESSED ===');
                showAlert('Debug', 'Bouton cliqué !');
                if (!isSending) {
                  sendTasks();
                }
              }}
              disabled={isSending}
              activeOpacity={0.7}
            >
              {isSending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <WebIcon name="send" size={20} color="white" />
                  <Text style={styles.sendButtonLargeText}>Envoyer les tâches</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView style={styles.tasksList}>
        {/* Pending tasks section */}
        {pendingTasks.length > 0 && (
          <View style={[styles.pendingSection, { backgroundColor: `${primaryColor}15` }]}>
            <Text style={[styles.pendingSectionTitle, { color: primaryColor, marginBottom: 12 }]}>À envoyer ({pendingTasks.length})</Text>
            {pendingTasks.map((task: DailyTask) => (
              <View key={task.task_id} style={styles.pendingTaskItem}>
                <View style={styles.pendingTaskContent}>
                  <Text style={styles.pendingTaskTitle}>{task.title}</Text>
                  <Text style={styles.pendingTaskCategory}>{getCategoryName(task.category_id)}</Text>
                  {task.assigned_user_name && <Text style={[styles.taskAssigned, { color: primaryColor }]}>👤 {task.assigned_user_name}</Text>}
                </View>
                <TouchableOpacity onPress={() => removePendingTask(task.task_id)} style={styles.removePendingButton}><WebIcon name="close-circle" size={24} color="#ff4444" /></TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Add punctual task - Admin or staff with permission */}
        {(user.role === 'admin' || canAddTaches) && (
          <TouchableOpacity style={[styles.addPunctualButton, { borderColor: primaryColor }]} onPress={() => setShowPunctualModal(true)} data-testid="add-punctual-task-btn">
            <WebIcon name="add-circle-outline" size={24} color={primaryColor} />
            <Text style={[styles.addPunctualButtonText, { color: primaryColor }]}>Ajouter une tâche ponctuelle</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionTitle, { color: primaryColor, marginTop: 24 }]}>Sélectionner depuis les modèles</Text>

        {Object.keys(templatesByCategory).length === 0 ? (
          <View style={styles.emptyState}>
            <WebIcon name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateText}>Aucune tâche modèle disponible</Text>
          </View>
        ) : (
          Object.entries(templatesByCategory).map(([categoryId, categoryTemplates]) => {
            const categoryUsers = getUsersForCategory(categoryId);
            return (
              <View key={categoryId} style={styles.categorySection}>
                <View style={styles.categorySectionHeaderRow}>
                  <Text style={[styles.categorySectionTitle, { color: primaryColor }]}>{getCategoryName(categoryId)}</Text>
                  {categoryUsers.length > 0 && <Text style={styles.staffCount}>{categoryUsers.length} pers.</Text>}
                </View>
                {(categoryTemplates as TaskTemplate[]).map((template: TaskTemplate) => {
                  const isAlreadySelected = alreadySelectedIds.has(template.template_id);
                  const selectionData = selectedTemplates.get(template.template_id);
                  const isSelected = selectionData?.selected || false;
                  const assignedUserId = selectionData?.assignedUserId;
                  const assignedUser = assignedUserId ? staffUsers.find((u: User) => u.user_id === assignedUserId) : null;
                  
                  return (
                    <View key={template.template_id} style={styles.templateWrapper}>
                      <TouchableOpacity 
                        style={[styles.selectableTemplate, isAlreadySelected && styles.selectableTemplateDisabled, isSelected && { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }]}
                        onPress={() => !isAlreadySelected && toggleTemplate(template.template_id)} 
                        disabled={isAlreadySelected}
                      >
                        <View style={[styles.templateCheckbox, { borderColor: primaryColor }, (isSelected || isAlreadySelected) && { backgroundColor: primaryColor }]}>
                          {(isSelected || isAlreadySelected) && <WebIcon name="checkmark" size={16} color={secondaryColor} />}
                        </View>
                        <View style={styles.templateSelectContent}>
                          <Text style={[styles.templateSelectTitle, isAlreadySelected && { color: '#999' }]}>{template.title}</Text>
                          {template.description && <Text style={styles.templateSelectDescription}>{template.description}</Text>}
                          {assignedUser && <Text style={[styles.taskAssigned, { color: primaryColor }]}>👤 {assignedUser.name}</Text>}
                        </View>
                        {isSelected && categoryUsers.length > 0 && (
                          <TouchableOpacity style={[styles.assignButton, { backgroundColor: primaryColor }]} onPress={() => setShowAssignModal(template.template_id)}>
                            <WebIcon name="person-add" size={18} color={secondaryColor} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}

        {selectedTemplates.size > 0 && (
          <TouchableOpacity style={[styles.confirmSelectionButton, { backgroundColor: primaryColor }]} onPress={selectTemplates}>
            <Text style={[styles.confirmSelectionButtonText, { color: secondaryColor }]}>Ajouter {selectedTemplates.size} tâche{selectedTemplates.size > 1 ? 's' : ''} à la liste</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Assign User Modal */}
      <Modal visible={!!showAssignModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryColor }]}>Assigner à qui ?</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(null)}><WebIcon name="close" size={28} color={primaryColor} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <TouchableOpacity style={styles.userPickerItem} onPress={() => showAssignModal && assignUserToTemplate(showAssignModal, null)}>
                <WebIcon name="people" size={24} color={primaryColor} />
                <Text style={[styles.userPickerName, { fontWeight: 'bold' }]}>Toute la catégorie</Text>
              </TouchableOpacity>
              {showAssignModal && getUsersForCategory(templates.find((t: TaskTemplate) => t.template_id === showAssignModal)?.category_id || '').map((u: User) => (
                <TouchableOpacity key={u.user_id} style={styles.userPickerItem} onPress={() => assignUserToTemplate(showAssignModal!, u.user_id)}>
                  <WebIcon name="person" size={24} color={primaryColor} />
                  <Text style={styles.userPickerName}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Punctual Task Modal */}
      <Modal visible={showPunctualModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Tâche ponctuelle</Text>
                <TouchableOpacity onPress={() => setShowPunctualModal(false)}><WebIcon name="close" size={28} color={primaryColor} /></TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Catégorie *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {categories.map((category: Category) => (
                    <TouchableOpacity key={category.category_id} style={[styles.categoryOption, punctualCategory === category.category_id && { backgroundColor: primaryColor }]} onPress={() => { setPunctualCategory(category.category_id); setPunctualAssignedUser(null); }}>
                      <Text style={[styles.categoryOptionText, { color: punctualCategory === category.category_id ? secondaryColor : primaryColor }]}>{category.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Titre *</Text>
                <TextInput style={[styles.modalInput, { borderColor: primaryColor }]} placeholder="Titre" value={punctualTitle} onChangeText={setPunctualTitle} />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Description</Text>
                <TextInput style={[styles.modalInput, styles.modalInputMultiline, { borderColor: primaryColor }]} placeholder="Description (optionnel)" value={punctualDescription} onChangeText={setPunctualDescription} multiline numberOfLines={3} />
                {punctualCategory && (
                  <>
                    <Text style={[styles.inputLabel, { color: primaryColor }]}>Assigner à (optionnel)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <TouchableOpacity style={[styles.categoryOption, !punctualAssignedUser && { backgroundColor: primaryColor }]} onPress={() => setPunctualAssignedUser(null)}>
                        <Text style={[styles.categoryOptionText, { color: !punctualAssignedUser ? secondaryColor : primaryColor }]}>Toute la catégorie</Text>
                      </TouchableOpacity>
                      {getUsersForCategory(punctualCategory).map((u: User) => (
                        <TouchableOpacity key={u.user_id} style={[styles.categoryOption, punctualAssignedUser === u.user_id && { backgroundColor: primaryColor }]} onPress={() => setPunctualAssignedUser(u.user_id)}>
                          <Text style={[styles.categoryOptionText, { color: punctualAssignedUser === u.user_id ? secondaryColor : primaryColor }]}>{u.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
                <TouchableOpacity style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} onPress={addPunctualTask}>
                  <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Ajouter</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ==================== TASK TEMPLATES SCREEN ====================
function TaskTemplatesScreen({ templates, categories, primaryColor, secondaryColor, apiRequest, loadTemplates, canAddModeles = false, canEditModeles = false, canDeleteModeles = false, user }: any) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('');
  
  // États pour les sous-tâches
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtaskName, setSubtaskName] = useState('');
  const [subtaskQuantity, setSubtaskQuantity] = useState<string>('');
  const [subtaskParentId, setSubtaskParentId] = useState('');
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  
  // Nouveaux états pour le type et la récurrence
  const [taskType, setTaskType] = useState<'manual' | 'permanent'>('manual');
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Charger les sous-tâches au montage
  useEffect(() => {
    loadSubtasks();
  }, []);

  const loadSubtasks = async () => {
    try {
      const data = await apiRequest('/subtasks/list');
      setSubtasks(data);
    } catch (error) {
      console.error('Error loading subtasks:', error);
    }
  };

  const templatesByCategory: Record<string, TaskTemplate[]> = {};
  templates.forEach((template: TaskTemplate) => { if (!templatesByCategory[template.category_id]) templatesByCategory[template.category_id] = []; templatesByCategory[template.category_id].push(template); });

  const resetForm = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskCategory('');
    setTaskType('manual');
    setRecurrenceType('daily');
    setSelectedDays([]);
    setEditingTemplateId(null);
  };

  const resetSubtaskForm = () => {
    setSubtaskName('');
    setSubtaskQuantity('');
    setSubtaskParentId('');
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleExpandTemplate = (templateId: string) => {
    setExpandedTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
      }
      return newSet;
    });
  };

  const openEditTemplateModal = (template: TaskTemplate) => {
    setEditingTemplateId(template.template_id);
    setNewTaskTitle(template.title);
    setNewTaskDescription(template.description || '');
    setNewTaskCategory(template.category_id);
    setTaskType(template.task_type || 'manual');
    if (template.recurrence_rule) {
      setRecurrenceType(template.recurrence_rule.type || 'daily');
      setSelectedDays(template.recurrence_rule.days_of_week || template.recurrence_rule.days_of_month || []);
    } else {
      setRecurrenceType('daily');
      setSelectedDays([]);
    }
    setShowAddModal(true);
  };

  const openSubtaskModal = (parentTemplateId?: string) => {
    if (parentTemplateId) {
      setSubtaskParentId(parentTemplateId);
    }
    setShowChoiceModal(false);
    setShowSubtaskModal(true);
  };

  const saveTemplate = async () => {
    if (!newTaskTitle || !newTaskCategory) { 
      Platform.OS === 'web' ? alert('Veuillez remplir les champs requis') : showAlert('Erreur', 'Veuillez remplir les champs requis'); 
      return; 
    }
    try {
      const recurrenceRule = taskType === 'permanent' ? {
        type: recurrenceType,
        days_of_week: recurrenceType === 'weekly' ? selectedDays : null,
        days_of_month: recurrenceType === 'monthly' ? selectedDays : null
      } : null;
      
      if (editingTemplateId) {
        // Mode édition - UPDATE
        await apiRequest(`/task-templates/${editingTemplateId}`, { 
          method: 'PUT', 
          body: JSON.stringify({ 
            title: newTaskTitle, 
            description: newTaskDescription || null, 
            category_id: newTaskCategory,
            task_type: taskType,
            recurrence_rule: recurrenceRule
          }) 
        });
        Platform.OS === 'web' ? alert('Modèle mis à jour !') : null;
      } else {
        // Mode création - CREATE
        await apiRequest('/task-templates/create', { 
          method: 'POST', 
          body: JSON.stringify({ 
            title: newTaskTitle, 
            description: newTaskDescription || null, 
            category_id: newTaskCategory,
            task_type: taskType,
            recurrence_rule: recurrenceRule
          }) 
        });
        Platform.OS === 'web' ? alert('Modèle créé !') : null;
      }
      setShowAddModal(false);
      resetForm();
      loadTemplates();
    } catch (error: any) { 
      Platform.OS === 'web' ? alert(error.message) : showAlert('Erreur', error.message); 
    }
  };

  const deleteTemplate = async (templateId: string) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm('Supprimer cette tâche modèle ?')
      : await new Promise<boolean>((resolve) => {
          showAlert('Supprimer', 'Supprimer cette tâche modèle ?', [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    
    if (!confirmed) return;
    try { 
      await apiRequest(`/task-templates/${templateId}`, { method: 'DELETE' }); 
      loadTemplates(); 
      Platform.OS === 'web' ? alert('Tâche modèle supprimée !') : null;
    } catch (e) { 
      Platform.OS === 'web' ? alert('Impossible de supprimer') : showAlert('Erreur', 'Impossible de supprimer'); 
    }
  };

  // Fonctions pour les sous-tâches
  const saveSubtask = async () => {
    if (!subtaskName || !subtaskParentId) {
      Platform.OS === 'web' ? alert('Veuillez sélectionner une tâche parente et entrer un nom') : showAlert('Erreur', 'Veuillez remplir les champs requis');
      return;
    }
    try {
      await apiRequest('/subtasks/create', {
        method: 'POST',
        body: JSON.stringify({
          parent_template_id: subtaskParentId,
          name: subtaskName,
          quantity: subtaskQuantity ? parseInt(subtaskQuantity) : null
        })
      });
      Platform.OS === 'web' ? alert('Sous-tâche créée !') : null;
      setShowSubtaskModal(false);
      resetSubtaskForm();
      loadSubtasks();
    } catch (error: any) {
      Platform.OS === 'web' ? alert(error.message) : showAlert('Erreur', error.message);
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm('Supprimer cette sous-tâche ?')
      : await new Promise<boolean>((resolve) => {
          showAlert('Supprimer', 'Supprimer cette sous-tâche ?', [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    
    if (!confirmed) return;
    try {
      await apiRequest(`/subtasks/${subtaskId}`, { method: 'DELETE' });
      loadSubtasks();
      Platform.OS === 'web' ? alert('Sous-tâche supprimée !') : null;
    } catch (e) {
      Platform.OS === 'web' ? alert('Impossible de supprimer') : showAlert('Erreur', 'Impossible de supprimer');
    }
  };

  const getSubtasksForTemplate = (templateId: string) => {
    return subtasks.filter(s => s.parent_template_id === templateId);
  };

  const getCategoryName = (categoryId: string) => categories.find((c: Category) => c.category_id === categoryId)?.name || 'Sans catégorie';

  // Composant pour sélection des jours de la semaine
  const WeekDaySelector = () => (
    <View style={styles.daySelector}>
      {DAY_NAMES.map((name, idx) => (
        <TouchableOpacity 
          key={idx}
          style={[styles.dayButton, selectedDays.includes(idx) && { backgroundColor: primaryColor }]}
          onPress={() => toggleDay(idx)}
        >
          <Text style={[styles.dayButtonText, selectedDays.includes(idx) && { color: secondaryColor }]}>{name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Composant pour sélection des jours du mois
  const MonthDaySelector = () => (
    <View style={styles.monthDaySelector}>
      {[...Array(31)].map((_, idx) => {
        const day = idx + 1;
        return (
          <TouchableOpacity 
            key={day}
            style={[styles.monthDayButton, selectedDays.includes(day) && { backgroundColor: primaryColor }]}
            onPress={() => toggleDay(day)}
          >
            <Text style={[styles.monthDayButtonText, selectedDays.includes(day) && { color: secondaryColor }]}>{day}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.screenContainer}>
      <Text style={[styles.screenTitle, { color: primaryColor }]}>Tâches modèles</Text>
      <Text style={[styles.screenSubtitle, { color: '#666' }]}>Créez des tâches manuelles ou permanentes/récurrentes</Text>
      <ScrollView style={styles.tasksList}>
        {Object.keys(templatesByCategory).length === 0 ? (
          <View style={styles.emptyState}><WebIcon name="document-text-outline" size={64} color="#ccc" /><Text style={styles.emptyStateText}>Aucune tâche modèle</Text><Text style={styles.emptyStateSubtext}>Appuyez sur + pour créer</Text></View>
        ) : (
          Object.entries(templatesByCategory).map(([categoryId, categoryTemplates]) => (
            <View key={categoryId} style={styles.categorySection}>
              <Text style={[styles.categorySectionTitle, { color: primaryColor }]}>{getCategoryName(categoryId)} ({(categoryTemplates as TaskTemplate[]).length})</Text>
              {(categoryTemplates as TaskTemplate[]).map((template: any) => {
                const templateSubtasks = getSubtasksForTemplate(template.template_id);
                const isExpanded = expandedTemplates.has(template.template_id);
                return (
                  <View key={template.template_id}>
                    <View style={styles.templateItem}>
                      <TouchableOpacity style={styles.templateContent} onPress={() => templateSubtasks.length > 0 && toggleExpandTemplate(template.template_id)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <Text style={[styles.templateTitle, { color: primaryColor }]}>{template.title}</Text>
                          {template.task_type === 'permanent' && (
                            <View style={[styles.taskTypeBadge, { backgroundColor: `${primaryColor}20` }]}>
                              <Text style={[styles.taskTypeBadgeText, { color: primaryColor }]}>
                                {template.recurrence_display || 'Permanent'}
                              </Text>
                            </View>
                          )}
                          {templateSubtasks.length > 0 && (
                            <View style={[styles.taskTypeBadge, { backgroundColor: '#4CAF5020' }]}>
                              <Text style={{ color: '#4CAF50', fontSize: 10 }}>
                                {templateSubtasks.length} sous-tâche{templateSubtasks.length > 1 ? 's' : ''} {isExpanded ? '[-]' : '[+]'}
                              </Text>
                            </View>
                          )}
                        </View>
                        {template.description && <Text style={styles.templateDescription}>{template.description}</Text>}
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* Bouton Ajouter sous-tâche - conditionné par permission */}
                        {(user?.role === 'admin' || canAddModeles) && (
                        <TouchableOpacity style={[styles.templateDeleteButton, Platform.OS === 'web' && { backgroundColor: '#4CAF5020', paddingHorizontal: 8, borderRadius: 4 }]} onPress={() => openSubtaskModal(template.template_id)} data-testid={`add-subtask-${template.template_id}`}>
                          {Platform.OS === 'web' ? (
                            <Text style={{ color: '#4CAF50', fontSize: 12, fontWeight: 'bold' }}>+ Sous</Text>
                          ) : (
                            <WebIcon name="add-circle-outline" size={20} color="#4CAF50" />
                          )}
                        </TouchableOpacity>
                        )}
                        {/* Bouton Modifier - conditionné par permission */}
                        {(user?.role === 'admin' || canEditModeles) && (
                        <TouchableOpacity style={[styles.templateDeleteButton, Platform.OS === 'web' && { backgroundColor: `${primaryColor}20`, paddingHorizontal: 8, borderRadius: 4 }]} onPress={() => openEditTemplateModal(template)} data-testid={`edit-template-${template.template_id}`}>
                          {Platform.OS === 'web' ? (
                            <Text style={{ color: primaryColor, fontSize: 12, fontWeight: 'bold' }}>Modifier</Text>
                          ) : (
                            <WebIcon name="pencil-outline" size={20} color={primaryColor} />
                          )}
                        </TouchableOpacity>
                        )}
                        {/* Bouton Supprimer - conditionné par permission */}
                        {(user?.role === 'admin' || canDeleteModeles) && (
                        <TouchableOpacity style={[styles.templateDeleteButton, Platform.OS === 'web' && { backgroundColor: '#ff444420', paddingHorizontal: 8, borderRadius: 4 }]} onPress={() => deleteTemplate(template.template_id)} data-testid={`delete-template-${template.template_id}`}>
                          {Platform.OS === 'web' ? (
                            <Text style={{ color: '#ff4444', fontSize: 12, fontWeight: 'bold' }}>Suppr.</Text>
                          ) : (
                            <WebIcon name="trash-outline" size={20} color="#ff4444" />
                          )}
                        </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {/* Afficher les sous-tâches si expanded */}
                    {isExpanded && templateSubtasks.length > 0 && (
                      <View style={{ marginLeft: 20, marginTop: 4, marginBottom: 8 }}>
                        {templateSubtasks.map((subtask: Subtask) => (
                          <View key={subtask.subtask_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#f5f5f5', borderRadius: 6, marginBottom: 4 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, color: '#333' }}>↳ {subtask.name}</Text>
                              {subtask.quantity && <Text style={{ fontSize: 12, color: '#666' }}>Quantité: {subtask.quantity}</Text>}
                            </View>
                            <TouchableOpacity onPress={() => deleteSubtask(subtask.subtask_id)} style={{ padding: 4 }}>
                              {(user?.role === 'admin' || canDeleteModeles) && (
                              <Text style={{ color: '#ff4444', fontSize: 12 }}>Suppr.</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
      {/* Bouton flottant + pour créer un modèle - conditionné par permission */}
      {(user?.role === 'admin' || canAddModeles) && (
      <TouchableOpacity style={[styles.addButton, { backgroundColor: primaryColor }]} onPress={() => setShowChoiceModal(true)} data-testid="add-template-btn"><WebIcon name="add" size={32} color={secondaryColor} /></TouchableOpacity>
      )}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxHeight: '90%' }]}>
              <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: primaryColor }]}>{editingTemplateId ? 'Modifier le modèle' : 'Nouvelle tâche modèle'}</Text><TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}><WebIcon name="close" size={28} color={primaryColor} /></TouchableOpacity></View>
              <ScrollView style={styles.modalBody}>
                {/* Type de tâche */}
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Type de tâche *</Text>
                <View style={styles.taskTypeSelector}>
                  <TouchableOpacity 
                    style={[styles.taskTypeOption, taskType === 'manual' && { backgroundColor: primaryColor }]}
                    onPress={() => { setTaskType('manual'); setSelectedDays([]); }}
                  >
                    <WebIcon name="hand-left-outline" size={20} color={taskType === 'manual' ? secondaryColor : primaryColor} />
                    <Text style={[styles.taskTypeOptionText, { color: taskType === 'manual' ? secondaryColor : primaryColor }]}>Manuelle</Text>
                    <Text style={[styles.taskTypeOptionHint, { color: taskType === 'manual' ? secondaryColor : '#888' }]}>Envoi manuel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.taskTypeOption, taskType === 'permanent' && { backgroundColor: primaryColor }]}
                    onPress={() => setTaskType('permanent')}
                  >
                    <WebIcon name="repeat-outline" size={20} color={taskType === 'permanent' ? secondaryColor : primaryColor} />
                    <Text style={[styles.taskTypeOptionText, { color: taskType === 'permanent' ? secondaryColor : primaryColor }]}>Permanente</Text>
                    <Text style={[styles.taskTypeOptionHint, { color: taskType === 'permanent' ? secondaryColor : '#888' }]}>Automatique</Text>
                  </TouchableOpacity>
                </View>

                {/* Options de récurrence si permanent */}
                {taskType === 'permanent' && (
                  <View style={styles.recurrenceSection}>
                    <Text style={[styles.inputLabel, { color: primaryColor }]}>Récurrence *</Text>
                    <View style={styles.recurrenceTypeSelector}>
                      <TouchableOpacity 
                        style={[styles.recurrenceTypeButton, recurrenceType === 'daily' && { backgroundColor: primaryColor }]}
                        onPress={() => { setRecurrenceType('daily'); setSelectedDays([]); }}
                      >
                        <Text style={[styles.recurrenceTypeText, { color: recurrenceType === 'daily' ? secondaryColor : '#666' }]}>Tous les jours</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.recurrenceTypeButton, recurrenceType === 'weekly' && { backgroundColor: primaryColor }]}
                        onPress={() => { setRecurrenceType('weekly'); setSelectedDays([]); }}
                      >
                        <Text style={[styles.recurrenceTypeText, { color: recurrenceType === 'weekly' ? secondaryColor : '#666' }]}>Hebdomadaire</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.recurrenceTypeButton, recurrenceType === 'monthly' && { backgroundColor: primaryColor }]}
                        onPress={() => { setRecurrenceType('monthly'); setSelectedDays([]); }}
                      >
                        <Text style={[styles.recurrenceTypeText, { color: recurrenceType === 'monthly' ? secondaryColor : '#666' }]}>Mensuel</Text>
                      </TouchableOpacity>
                    </View>
                    {recurrenceType === 'weekly' && (
                      <>
                        <Text style={styles.recurrenceHint}>Sélectionnez les jours de la semaine :</Text>
                        <WeekDaySelector />
                      </>
                    )}
                    {recurrenceType === 'monthly' && (
                      <>
                        <Text style={styles.recurrenceHint}>Sélectionnez les jours du mois :</Text>
                        <MonthDaySelector />
                      </>
                    )}
                  </View>
                )}

                <Text style={[styles.inputLabel, { color: primaryColor, marginTop: 16 }]}>Catégorie *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {categories.map((category: Category) => (<TouchableOpacity key={category.category_id} style={[styles.categoryOption, newTaskCategory === category.category_id && { backgroundColor: primaryColor }]} onPress={() => setNewTaskCategory(category.category_id)}><Text style={[styles.categoryOptionText, { color: newTaskCategory === category.category_id ? secondaryColor : primaryColor }]}>{category.name}</Text></TouchableOpacity>))}
                </ScrollView>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Titre *</Text>
                <TextInput style={[styles.modalInput, { borderColor: primaryColor }]} placeholder="Titre de la tâche" value={newTaskTitle} onChangeText={setNewTaskTitle} />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Description</Text>
                <TextInput style={[styles.modalInput, styles.modalInputMultiline, { borderColor: primaryColor }]} placeholder="Description (optionnel)" value={newTaskDescription} onChangeText={setNewTaskDescription} multiline numberOfLines={3} />
                <TouchableOpacity style={[styles.modalSubmitButton, { backgroundColor: primaryColor }]} onPress={saveTemplate}><Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>{editingTemplateId ? 'Enregistrer' : 'Créer'}</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal de choix: Tâche ou Sous-tâche */}
      <Modal visible={showChoiceModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, padding: 24, maxWidth: 400 }]}>
            <Text style={[styles.modalTitle, { color: primaryColor, marginBottom: 20, textAlign: 'center' }]}>Que souhaitez-vous créer ?</Text>
            <TouchableOpacity
              style={[styles.choiceButton, { backgroundColor: primaryColor, marginBottom: 12 }]}
              onPress={() => { setShowChoiceModal(false); setShowAddModal(true); }}
              data-testid="choice-task-button"
            >
              <Text style={[styles.choiceButtonText, { color: secondaryColor }]}>Tâche</Text>
              <Text style={{ color: secondaryColor, fontSize: 12, opacity: 0.8 }}>Un modèle de tâche standard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceButton, { backgroundColor: '#4CAF50', marginBottom: 12 }]}
              onPress={() => openSubtaskModal()}
              data-testid="choice-subtask-button"
            >
              <Text style={[styles.choiceButtonText, { color: '#fff' }]}>Sous-tâche</Text>
              <Text style={{ color: '#fff', fontSize: 12, opacity: 0.8 }}>Une sous-tâche liée à une tâche parente</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 12, alignItems: 'center' }}
              onPress={() => setShowChoiceModal(false)}
            >
              <Text style={{ color: '#666' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de création de sous-tâche */}
      <Modal visible={showSubtaskModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: '#4CAF50' }]}>Nouvelle sous-tâche</Text>
                <TouchableOpacity onPress={() => { setShowSubtaskModal(false); resetSubtaskForm(); }}>
                  <WebIcon name="close" size={28} color="#4CAF50" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: '#4CAF50' }]}>Tâche parente *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {templates.map((template: TaskTemplate) => (
                    <TouchableOpacity
                      key={template.template_id}
                      style={[
                        styles.categoryOption,
                        { borderColor: '#4CAF50' },
                        subtaskParentId === template.template_id && { backgroundColor: '#4CAF50' }
                      ]}
                      onPress={() => setSubtaskParentId(template.template_id)}
                    >
                      <Text style={[
                        styles.categoryOptionText,
                        { color: subtaskParentId === template.template_id ? '#fff' : '#4CAF50' }
                      ]}>
                        {template.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.inputLabel, { color: '#4CAF50' }]}>Nom de la sous-tâche *</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: '#4CAF50' }]}
                  placeholder="Ex: Couper les oignons"
                  value={subtaskName}
                  onChangeText={setSubtaskName}
                />

                <Text style={[styles.inputLabel, { color: '#4CAF50' }]}>Quantité (optionnel)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <TouchableOpacity
                    style={[styles.quantityButton, { backgroundColor: '#4CAF50' }]}
                    onPress={() => setSubtaskQuantity(prev => String(Math.max(0, (parseInt(prev) || 0) - 1)))}
                  >
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.modalInput, { borderColor: '#4CAF50', width: 80, textAlign: 'center', marginHorizontal: 12 }]}
                    placeholder="0"
                    value={subtaskQuantity}
                    onChangeText={(text) => setSubtaskQuantity(text.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={[styles.quantityButton, { backgroundColor: '#4CAF50' }]}
                    onPress={() => setSubtaskQuantity(prev => String((parseInt(prev) || 0) + 1))}
                  >
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.modalSubmitButton, { backgroundColor: '#4CAF50' }]}
                  onPress={saveSubtask}
                  data-testid="save-subtask-button"
                >
                  <Text style={[styles.modalSubmitButtonText, { color: '#fff' }]}>Créer la sous-tâche</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ==================== CATEGORIES SCREEN ====================
function CategoriesScreen({ categories, primaryColor, secondaryColor, apiRequest, loadCategories, user, canAddCategory = false, canEditCategory = false, canDeleteCategory = false }: any) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const addCategory = async () => {
    if (!newCategoryName.trim()) { 
      Platform.OS === 'web' ? alert('Veuillez entrer un nom') : showAlert('Erreur', 'Veuillez entrer un nom'); 
      return; 
    }
    setIsAdding(true);
    try { 
      await apiRequest('/categories/create', { method: 'POST', body: JSON.stringify({ name: newCategoryName.trim() }) }); 
      setNewCategoryName(''); 
      loadCategories();
      Platform.OS === 'web' ? alert('Catégorie créée !') : showAlert('Succès', 'Catégorie créée !');
    }
    catch (error: any) { 
      Platform.OS === 'web' ? alert(error.message) : showAlert('Erreur', error.message); 
    }
    finally { setIsAdding(false); }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setEditCategoryName(category.name);
  };

  const updateCategory = async () => {
    if (!editingCategory || !editCategoryName.trim()) return;
    setIsEditing(true);
    try {
      await apiRequest(`/categories/${editingCategory.category_id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ name: editCategoryName.trim() }) 
      });
      setEditingCategory(null);
      loadCategories();
      Platform.OS === 'web' ? alert('Catégorie modifiée !') : showAlert('Succès', 'Catégorie modifiée !');
    } catch (error: any) { 
      Platform.OS === 'web' ? alert(error.message) : showAlert('Erreur', error.message); 
    }
    finally { setIsEditing(false); }
  };

  const deleteCategory = async (categoryId: string, categoryName: string) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm(`Supprimer "${categoryName}" ?`)
      : await new Promise<boolean>((resolve) => {
          showAlert('Supprimer', `Supprimer "${categoryName}" ?`, [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    
    if (!confirmed) return;
    try { 
      await apiRequest(`/categories/${categoryId}`, { method: 'DELETE' }); 
      loadCategories(); 
      Platform.OS === 'web' ? alert('Catégorie supprimée !') : null;
    } catch (e) { 
      Platform.OS === 'web' ? alert('Impossible de supprimer') : showAlert('Erreur', 'Impossible de supprimer'); 
    }
  };

  return (
    <ScrollView style={styles.screenContainer}>
      <Text style={[styles.screenTitle, { color: primaryColor }]}>Gérer les catégories</Text>
      <Text style={[styles.screenSubtitle, { color: '#666' }]}>Ajouter, modifier ou supprimer des catégories</Text>
      
      {/* Add new category - conditionné par permission */}
      {(user?.role === 'admin' || canAddCategory) && (
      <View style={styles.addCategorySection}>
        <View style={[styles.addCategoryInput, { borderColor: primaryColor }]}>
          <TextInput 
            style={styles.addCategoryTextInput} 
            placeholder="Nouvelle catégorie" 
            value={newCategoryName} 
            onChangeText={setNewCategoryName} 
          />
          <TouchableOpacity 
            style={[styles.addCategoryButton, { backgroundColor: primaryColor }]} 
            onPress={addCategory} 
            disabled={isAdding}
            data-testid="add-category-btn"
          >
            {isAdding ? <ActivityIndicator color={secondaryColor} size="small" /> : <WebIcon name="add" size={24} color={secondaryColor} />}
          </TouchableOpacity>
        </View>
      </View>
      )}
      
      {/* Categories list */}
      <View style={styles.categoriesList}>
        {categories.length === 0 ? (
          <Text style={{ color: '#999', textAlign: 'center', marginTop: 20 }}>Aucune catégorie</Text>
        ) : (
          categories.map((category: Category, index: number) => (
            <View key={category.category_id} style={styles.categoryItem}>
              {/* Flèches pour réorganiser */}
              <View style={{ flexDirection: 'column', marginRight: 8 }}>
                <TouchableOpacity 
                  style={{ padding: 4, opacity: index === 0 ? 0.3 : 1 }}
                  disabled={index === 0}
                  onPress={async () => {
                    if (index === 0) return;
                    const newOrder = [...categories];
                    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                    try {
                      await apiRequest('/categories/reorder', {
                        method: 'POST',
                        body: JSON.stringify({ category_ids: newOrder.map((c: Category) => c.category_id) })
                      });
                      loadCategories();
                    } catch (e) { showAlert('Erreur', 'Impossible de réorganiser'); }
                  }}
                  data-testid={`move-up-${category.category_id}`}
                >
                  <WebIcon name="chevron-up" size={18} color={primaryColor} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ padding: 4, opacity: index === categories.length - 1 ? 0.3 : 1 }}
                  disabled={index === categories.length - 1}
                  onPress={async () => {
                    if (index === categories.length - 1) return;
                    const newOrder = [...categories];
                    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                    try {
                      await apiRequest('/categories/reorder', {
                        method: 'POST',
                        body: JSON.stringify({ category_ids: newOrder.map((c: Category) => c.category_id) })
                      });
                      loadCategories();
                    } catch (e) { showAlert('Erreur', 'Impossible de réorganiser'); }
                  }}
                  data-testid={`move-down-${category.category_id}`}
                >
                  <WebIcon name="chevron-down" size={18} color={primaryColor} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.categoryItemLeft}>
                <View style={[styles.categoryIcon, { backgroundColor: primaryColor }]}>
                  <Text style={[styles.categoryIconText, { color: secondaryColor }]}>{index + 1}</Text>
                </View>
                <Text style={[styles.categoryItemName, { color: primaryColor }]}>{category.name}</Text>
              </View>
              <View style={styles.categoryItemActions}>
                {/* Bouton Modifier - conditionné par permission */}
                {(user?.role === 'admin' || canEditCategory) && (
                <TouchableOpacity 
                  style={[styles.categoryEditButton, { marginRight: 8 }]} 
                  onPress={() => openEditModal(category)}
                  data-testid={`edit-category-${category.category_id}`}
                >
                  <WebIcon name="pencil-outline" size={20} color={primaryColor} />
                </TouchableOpacity>
                )}
                {/* Bouton Supprimer - conditionné par permission */}
                {(user?.role === 'admin' || canDeleteCategory) && (
                <TouchableOpacity 
                  style={styles.categoryDeleteButton} 
                  onPress={() => deleteCategory(category.category_id, category.name)}
                  data-testid={`delete-category-${category.category_id}`}
                >
                  <WebIcon name="trash-outline" size={20} color="#ff4444" />
                </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Edit Category Modal */}
      <Modal visible={editingCategory !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400 }]}>
            <View style={[styles.modalHeader, { backgroundColor: primaryColor }]}>
              <Text style={[styles.modalTitle, { color: secondaryColor }]}>Modifier la catégorie</Text>
              <TouchableOpacity onPress={() => setEditingCategory(null)}>
                <WebIcon name="close" size={24} color={secondaryColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom de la catégorie</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: primaryColor }]}
                value={editCategoryName}
                onChangeText={setEditCategoryName}
                placeholder="Nom de la catégorie"
              />
              <TouchableOpacity 
                style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 16 }]} 
                onPress={updateCategory}
                disabled={isEditing}
              >
                {isEditing ? (
                  <ActivityIndicator color={secondaryColor} size="small" />
                ) : (
                  <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
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

// ==================== PRESTATAIRES SCREEN ====================
function PrestatairesScreen(_props: any) { return null as any; }

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

// ==================== HISTORY SCREEN ====================
function HistoryScreen({ history, tasks, selectedDate, setSelectedDate, primaryColor, secondaryColor, onRefresh }: any) {
  const getTaskTitle = (taskId: string) => { if (taskId === 'batch_send') return 'Envoi des tâches'; return tasks.find((t: DailyTask) => t.task_id === taskId)?.title || 'Tâche'; };
  const getActionText = (action: string) => { if (action.startsWith('sent_tasks_')) return 'a envoyé les tâches'; switch (action) { case 'completed': return 'a terminé'; default: return action; } };
  const formatTimestamp = (timestamp: string) => new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <ScrollView style={styles.screenContainer}>
      <View style={styles.dateSelector}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setSelectedDate(addDays(selectedDate, -1))}><WebIcon name="chevron-back" size={24} color={primaryColor} /></TouchableOpacity>
        <View style={styles.dateDisplay}><Text style={[styles.dateText, { color: primaryColor }]}>{formatDate(selectedDate)}</Text>{selectedDate === getTodayDate() && <Text style={[styles.todayBadge, { backgroundColor: primaryColor, color: secondaryColor }]}>Aujourd'hui</Text>}</View>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setSelectedDate(addDays(selectedDate, 1))}><WebIcon name="chevron-forward" size={24} color={primaryColor} /></TouchableOpacity>
      </View>
      <Text style={[styles.screenTitle, { color: primaryColor }]}>Historique</Text>
      {history.length === 0 ? (
        <View style={styles.emptyState}><WebIcon name="time-outline" size={64} color="#ccc" /><Text style={styles.emptyStateText}>Aucune activité</Text></View>
      ) : (
        <View style={styles.historyList}>
          {history.map((item: TaskHistory) => (
            <View key={item.history_id} style={styles.historyItem}>
              <View style={[styles.historyDot, { backgroundColor: primaryColor }]} />
              <View style={styles.historyContent}>
                <Text style={styles.historyText}><Text style={[styles.historyUserName, { color: primaryColor }]}>{item.user_name}</Text> {getActionText(item.action)} {item.task_id !== 'batch_send' && <Text style={styles.historyTaskTitle}>"{getTaskTitle(item.task_id)}"</Text>}</Text>
                <Text style={styles.historyTime}>{formatTimestamp(item.timestamp)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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

// ==================== PERMANENT TASKS SCREEN ====================
function PermanentTasksScreen({ permanentCategories, permanentTasks, primaryColor, secondaryColor, apiRequest, loadCategories, loadTasks }: any) {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddTask, setShowAddTask] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  
  // États pour la récurrence
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedDays, setSelectedDays] = useState<number[]>([]); // Pour weekly: 0-6, Pour monthly: 1-31
  
  // États pour édition de tâche
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editRecurrenceType, setEditRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [editSelectedDays, setEditSelectedDays] = useState<number[]>([]);
  
  // États pour les sous-tâches permanentes
  const [permanentSubtasks, setPermanentSubtasks] = useState<any[]>([]);
  const [showAddSubtask, setShowAddSubtask] = useState<string | null>(null);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [newSubtaskQuantity, setNewSubtaskQuantity] = useState('');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Charger les sous-tâches permanentes
  useEffect(() => {
    loadPermanentSubtasks();
  }, []);

  const loadPermanentSubtasks = async () => {
    try {
      const data = await apiRequest('/permanent-subtasks/list');
      setPermanentSubtasks(data);
    } catch (error) {
      console.error('Error loading permanent subtasks:', error);
    }
  };

  const getSubtasksForTask = (taskId: string) => {
    return permanentSubtasks.filter((s: any) => s.parent_permanent_task_id === taskId);
  };

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const addSubtask = async (taskId: string) => {
    if (!newSubtaskName.trim()) return;
    try {
      await apiRequest('/permanent-subtasks/create', { 
        method: 'POST', 
        body: JSON.stringify({ 
          parent_permanent_task_id: taskId, 
          name: newSubtaskName,
          quantity: newSubtaskQuantity ? parseInt(newSubtaskQuantity) : null
        }) 
      });
      setNewSubtaskName('');
      setNewSubtaskQuantity('');
      setShowAddSubtask(null);
      loadPermanentSubtasks();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const deleteSubtask = async (subtaskId: string) => {
    showAlert('Supprimer', 'Supprimer cette sous-tâche ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await apiRequest(`/permanent-subtasks/${subtaskId}`, { method: 'DELETE' }); loadPermanentSubtasks(); }
        catch (error: any) { showAlert('Erreur', error.message); }
      }}
    ]);
  };

  const resetTaskForm = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setRecurrenceType('daily');
    setSelectedDays([]);
  };

  const toggleDay = (day: number, isEdit: boolean = false) => {
    if (isEdit) {
      setEditSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    } else {
      setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await apiRequest('/permanent-categories/create', { method: 'POST', body: JSON.stringify({ name: newCategoryName }) });
      setNewCategoryName('');
      setShowAddCategory(false);
      loadCategories();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const addTask = async (categoryId: string) => {
    if (!newTaskTitle.trim()) return;
    try {
      const recurrenceRule = recurrenceType === 'daily' ? null : {
        type: recurrenceType,
        days_of_week: recurrenceType === 'weekly' ? selectedDays : null,
        days_of_month: recurrenceType === 'monthly' ? selectedDays : null
      };
      
      await apiRequest('/permanent-tasks/create', { method: 'POST', body: JSON.stringify({ 
        permanent_category_id: categoryId, 
        title: newTaskTitle, 
        description: newTaskDescription || null,
        recurrence_rule: recurrenceRule
      }) });
      resetTaskForm();
      setShowAddTask(null);
      loadTasks();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const startEditTask = (task: any) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description || '');
    const rule = task.recurrence_rule;
    if (!rule || rule.type === 'daily') {
      setEditRecurrenceType('daily');
      setEditSelectedDays([]);
    } else if (rule.type === 'weekly') {
      setEditRecurrenceType('weekly');
      setEditSelectedDays(rule.days_of_week || []);
    } else if (rule.type === 'monthly') {
      setEditRecurrenceType('monthly');
      setEditSelectedDays(rule.days_of_month || []);
    }
  };

  const saveEditTask = async () => {
    if (!editTaskTitle.trim() || !editingTask) return;
    try {
      const recurrenceRule = editRecurrenceType === 'daily' ? { type: 'daily', days_of_week: null, days_of_month: null } : {
        type: editRecurrenceType,
        days_of_week: editRecurrenceType === 'weekly' ? editSelectedDays : null,
        days_of_month: editRecurrenceType === 'monthly' ? editSelectedDays : null
      };
      
      await apiRequest(`/permanent-tasks/${editingTask.permanent_task_id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ 
          title: editTaskTitle, 
          description: editTaskDescription || null,
          recurrence_rule: recurrenceRule
        }) 
      });
      setEditingTask(null);
      loadTasks();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const deleteCategory = async (categoryId: string) => {
    showAlert('Supprimer', 'Supprimer cette catégorie et toutes ses tâches ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await apiRequest(`/permanent-categories/${categoryId}`, { method: 'DELETE' }); loadCategories(); loadTasks(); }
        catch (error: any) { showAlert('Erreur', error.message); }
      }}
    ]);
  };

  const deleteTask = async (taskId: string) => {
    showAlert('Supprimer', 'Supprimer cette tâche permanente ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await apiRequest(`/permanent-tasks/${taskId}`, { method: 'DELETE' }); loadTasks(); }
        catch (error: any) { showAlert('Erreur', error.message); }
      }}
    ]);
  };

  const startEditCategory = (category: any) => {
    setEditingCategory(category.permanent_category_id);
    setEditCategoryName(category.name);
  };

  const saveEditCategory = async () => {
    if (!editCategoryName.trim() || !editingCategory) return;
    try {
      await apiRequest(`/permanent-categories/${editingCategory}`, { 
        method: 'PUT', 
        body: JSON.stringify({ name: editCategoryName }) 
      });
      setEditingCategory(null);
      setEditCategoryName('');
      loadCategories();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId) 
        : [...prev, categoryId]
    );
  };

  const getTasksForCategory = (categoryId: string) => 
    permanentTasks.filter((t: any) => t.permanent_category_id === categoryId);

  // Composant pour sélection des jours de la semaine
  const WeekDaySelector = ({ selected, onToggle }: { selected: number[], onToggle: (day: number) => void }) => (
    <View style={styles.daySelector}>
      {DAY_NAMES.map((name, idx) => (
        <TouchableOpacity 
          key={idx}
          style={[styles.dayButton, selected.includes(idx) && { backgroundColor: primaryColor }]}
          onPress={() => onToggle(idx)}
        >
          <Text style={[styles.dayButtonText, selected.includes(idx) && { color: secondaryColor }]}>{name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Composant pour sélection des jours du mois
  const MonthDaySelector = ({ selected, onToggle }: { selected: number[], onToggle: (day: number) => void }) => (
    <View style={styles.monthDaySelector}>
      {[...Array(31)].map((_, idx) => {
        const day = idx + 1;
        return (
          <TouchableOpacity 
            key={day}
            style={[styles.monthDayButton, selected.includes(day) && { backgroundColor: primaryColor }]}
            onPress={() => onToggle(day)}
          >
            <Text style={[styles.monthDayButtonText, selected.includes(day) && { color: secondaryColor }]}>{day}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // Composant pour le formulaire de récurrence
  const RecurrenceForm = ({ type, setType, days, toggleDay, isEdit = false }: any) => (
    <View style={styles.recurrenceForm}>
      <Text style={[styles.inputLabel, { color: primaryColor }]}>Récurrence</Text>
      <View style={styles.recurrenceTypeSelector}>
        <TouchableOpacity 
          style={[styles.recurrenceTypeButton, type === 'daily' && { backgroundColor: primaryColor }]}
          onPress={() => { setType('daily'); if (!isEdit) setSelectedDays([]); else setEditSelectedDays([]); }}
        >
          <Text style={[styles.recurrenceTypeText, type === 'daily' && { color: secondaryColor }]}>Tous les jours</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.recurrenceTypeButton, type === 'weekly' && { backgroundColor: primaryColor }]}
          onPress={() => { setType('weekly'); if (!isEdit) setSelectedDays([]); else setEditSelectedDays([]); }}
        >
          <Text style={[styles.recurrenceTypeText, type === 'weekly' && { color: secondaryColor }]}>Hebdomadaire</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.recurrenceTypeButton, type === 'monthly' && { backgroundColor: primaryColor }]}
          onPress={() => { setType('monthly'); if (!isEdit) setSelectedDays([]); else setEditSelectedDays([]); }}
        >
          <Text style={[styles.recurrenceTypeText, type === 'monthly' && { color: secondaryColor }]}>Mensuel</Text>
        </TouchableOpacity>
      </View>
      {type === 'weekly' && (
        <>
          <Text style={styles.recurrenceHint}>Sélectionnez les jours de la semaine :</Text>
          <WeekDaySelector selected={days} onToggle={toggleDay} />
        </>
      )}
      {type === 'monthly' && (
        <>
          <Text style={styles.recurrenceHint}>Sélectionnez les jours du mois :</Text>
          <MonthDaySelector selected={days} onToggle={toggleDay} />
        </>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.screenContainer}>
      <View style={styles.screenHeader}>
        <Text style={[styles.screenTitle, { color: primaryColor }]}>Tâches Permanentes</Text>
        <Text style={styles.screenSubtitle}>Gérez vos tâches récurrentes (quotidiennes, hebdomadaires, mensuelles)</Text>
      </View>

      {/* Bouton ajouter catégorie */}
      <TouchableOpacity 
        style={[styles.addButton, { backgroundColor: primaryColor }]} 
        onPress={() => setShowAddCategory(true)}
        data-testid="add-permanent-category-btn"
      >
        <WebIcon name="add" size={20} color={secondaryColor} />
        <Text style={[styles.addButtonText, { color: secondaryColor }]}>Ajouter une catégorie</Text>
      </TouchableOpacity>

      {/* Modal ajouter catégorie */}
      {showAddCategory && (
        <View style={styles.addCategoryModal}>
          <Text style={[styles.modalTitle, { color: primaryColor }]}>Nouvelle catégorie</Text>
          <TextInput
            style={[styles.settingsInput, { borderColor: primaryColor }]}
            placeholder="Nom (ex: Ouverture, Fermeture...)"
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            data-testid="new-permanent-category-name"
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => { setShowAddCategory(false); setNewCategoryName(''); }}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalConfirmButton, { backgroundColor: primaryColor }]} 
              onPress={addCategory}
              data-testid="confirm-add-permanent-category"
            >
              <Text style={[styles.modalConfirmText, { color: secondaryColor }]}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal édition de tâche */}
      <Modal visible={editingTask !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 500, width: '95%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryColor }]}>Modifier la tâche</Text>
              <TouchableOpacity onPress={() => setEditingTask(null)}>
                <WebIcon name="close" size={28} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.modalBody}>
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Titre *</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: primaryColor }]}
                  placeholder="Titre de la tâche"
                  value={editTaskTitle}
                  onChangeText={setEditTaskTitle}
                />
                <Text style={[styles.inputLabel, { color: primaryColor }]}>Description</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: primaryColor }]}
                  placeholder="Description (optionnel)"
                  value={editTaskDescription}
                  onChangeText={setEditTaskDescription}
                  multiline
                />
                <RecurrenceForm 
                  type={editRecurrenceType} 
                  setType={setEditRecurrenceType} 
                  days={editSelectedDays} 
                  toggleDay={(d: number) => toggleDay(d, true)}
                  isEdit={true}
                />
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 16 }]} 
                  onPress={saveEditTask}
                >
                  <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Liste des catégories */}
      {permanentCategories.length === 0 ? (
        <View style={styles.emptyState}>
          <WebIcon name="repeat-outline" size={64} color="#ccc" />
          <Text style={styles.emptyStateText}>Aucune catégorie permanente</Text>
          <Text style={styles.emptyStateSubtext}>Créez des catégories comme "Ouverture" ou "Fermeture" pour organiser vos tâches quotidiennes</Text>
        </View>
      ) : (
        permanentCategories.map((category: any) => (
          <View key={category.permanent_category_id} style={styles.permanentCategoryContainer}>
            {/* En-tête de la catégorie */}
            <TouchableOpacity 
              style={[styles.permanentCategoryHeaderItem, { borderLeftColor: primaryColor }]}
              onPress={() => toggleCategory(category.permanent_category_id)}
              data-testid={`permanent-category-${category.permanent_category_id}`}
            >
              <View style={styles.permanentCategoryLeft}>
                <WebIcon 
                  name={expandedCategories.includes(category.permanent_category_id) ? "chevron-down" : "chevron-forward"} 
                  size={20} 
                  color={primaryColor} 
                />
                {editingCategory === category.permanent_category_id ? (
                  <TextInput
                    style={[styles.inlineEditInput, { borderColor: primaryColor }]}
                    value={editCategoryName}
                    onChangeText={setEditCategoryName}
                    autoFocus
                    onBlur={saveEditCategory}
                    onSubmitEditing={saveEditCategory}
                  />
                ) : (
                  <Text style={[styles.permanentCategoryName, { color: primaryColor }]}>{category.name}</Text>
                )}
                <Text style={styles.taskCount}>({getTasksForCategory(category.permanent_category_id).length} tâches)</Text>
              </View>
              <View style={styles.permanentCategoryActions}>
                <TouchableOpacity 
                  style={styles.iconButton} 
                  onPress={(e) => { e.stopPropagation(); startEditCategory(category); }}
                >
                  <WebIcon name="pencil-outline" size={18} color="#666" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.iconButton} 
                  onPress={(e) => { e.stopPropagation(); deleteCategory(category.permanent_category_id); }}
                >
                  <WebIcon name="trash-outline" size={18} color="#e53935" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Tâches de la catégorie (si expandée) */}
            {expandedCategories.includes(category.permanent_category_id) && (
              <View style={styles.permanentTasksList}>
                {getTasksForCategory(category.permanent_category_id).map((task: any) => {
                  const taskSubtasks = getSubtasksForTask(task.permanent_task_id);
                  const hasSubtasks = taskSubtasks.length > 0;
                  const isTaskExpanded = expandedTasks.has(task.permanent_task_id);
                  
                  return (
                    <View key={task.permanent_task_id}>
                      <View style={styles.permanentTaskItem}>
                        <View style={styles.permanentTaskContent}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.permanentTaskTitle}>{task.title}</Text>
                            {hasSubtasks && (
                              <Pressable 
                                onPress={() => toggleTaskExpand(task.permanent_task_id)}
                                style={{ backgroundColor: '#4CAF5020', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, cursor: 'pointer' } as any}
                              >
                                <Text style={{ color: '#4CAF50', fontSize: 11 }}>
                                  {taskSubtasks.length} sous-tâche{taskSubtasks.length > 1 ? 's' : ''} {isTaskExpanded ? '[-]' : '[+]'}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                          {task.description && <Text style={styles.permanentTaskDescription}>{task.description}</Text>}
                          <Text style={[styles.recurrenceBadge, { backgroundColor: `${primaryColor}20`, color: primaryColor }]}>
                            {task.recurrence_display || 'Tous les jours'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {/* Bouton ajouter sous-tâche */}
                          <TouchableOpacity 
                            style={[styles.iconButton, { marginRight: 4, backgroundColor: '#4CAF5015' }]} 
                            onPress={() => setShowAddSubtask(showAddSubtask === task.permanent_task_id ? null : task.permanent_task_id)}
                          >
                            <Text style={{ color: '#4CAF50', fontSize: 11, fontWeight: 'bold' }}>+ST</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.iconButton, { marginRight: 4 }]} 
                            onPress={() => startEditTask(task)}
                          >
                            <WebIcon name="pencil-outline" size={18} color="#666" />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.deleteTaskButton} 
                            onPress={() => deleteTask(task.permanent_task_id)}
                          >
                            <WebIcon name="close-circle" size={20} color="#e53935" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      
                      {/* Formulaire d'ajout de sous-tâche */}
                      {showAddSubtask === task.permanent_task_id && (
                        <View style={{ marginLeft: 16, marginBottom: 8, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#1A3A5C' }}>
                          <Text style={{ fontWeight: '600', marginBottom: 8, color: primaryColor }}>Nouvelle sous-tâche</Text>
                          <TextInput
                            style={[styles.settingsInput, { borderColor: primaryColor, marginBottom: 8 }]}
                            placeholder="Nom de la sous-tâche"
                            value={newSubtaskName}
                            onChangeText={setNewSubtaskName}
                          />
                          <TextInput
                            style={[styles.settingsInput, { borderColor: primaryColor, marginBottom: 8 }]}
                            placeholder="Quantité initiale (optionnel)"
                            value={newSubtaskQuantity}
                            onChangeText={setNewSubtaskQuantity}
                            keyboardType="numeric"
                          />
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                            <TouchableOpacity 
                              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
                              onPress={() => { setShowAddSubtask(null); setNewSubtaskName(''); setNewSubtaskQuantity(''); }}
                            >
                              <Text style={{ color: '#666' }}>Annuler</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: primaryColor, borderRadius: 4 }}
                              onPress={() => addSubtask(task.permanent_task_id)}
                            >
                              <Text style={{ color: secondaryColor }}>Ajouter</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      
                      {/* Affichage des sous-tâches */}
                      {isTaskExpanded && hasSubtasks && (
                        <View style={{ marginLeft: 16, marginBottom: 8 }}>
                          {taskSubtasks.map((subtask: any) => (
                            <View 
                              key={subtask.subtask_id} 
                              style={{ 
                                flexDirection: 'row', 
                                alignItems: 'center', 
                                paddingVertical: 10, 
                                paddingHorizontal: 12, 
                                backgroundColor: '#f8f9fa', 
                                borderRadius: 6, 
                                marginBottom: 4,
                                borderLeftWidth: 3,
                                borderLeftColor: '#1A3A5C'
                              }}
                            >
                              <Text style={{ flex: 1, fontSize: 14, color: '#333' }}>
                                ↳ {subtask.name}
                              </Text>
                              {subtask.quantity !== null && subtask.quantity !== undefined && (
                                <Text style={{ fontSize: 12, color: '#666', marginRight: 8 }}>
                                  Qté: {subtask.quantity}
                                </Text>
                              )}
                              <TouchableOpacity 
                                onPress={() => deleteSubtask(subtask.subtask_id)}
                                style={{ padding: 4 }}
                              >
                                <WebIcon name="trash-outline" size={16} color="#e53935" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Formulaire d'ajout de tâche */}
                {showAddTask === category.permanent_category_id ? (
                  <View style={styles.addTaskForm}>
                    <TextInput
                      style={[styles.settingsInput, { borderColor: primaryColor }]}
                      placeholder="Titre de la tâche"
                      value={newTaskTitle}
                      onChangeText={setNewTaskTitle}
                      data-testid="new-permanent-task-title"
                    />
                    <TextInput
                      style={[styles.settingsInput, { borderColor: primaryColor }]}
                      placeholder="Description (optionnel)"
                      value={newTaskDescription}
                      onChangeText={setNewTaskDescription}
                    />
                    <RecurrenceForm 
                      type={recurrenceType} 
                      setType={setRecurrenceType} 
                      days={selectedDays} 
                      toggleDay={(d: number) => toggleDay(d, false)}
                    />
                    <View style={styles.addTaskButtons}>
                      <TouchableOpacity style={styles.cancelTaskButton} onPress={() => { setShowAddTask(null); resetTaskForm(); }}>
                        <Text style={styles.cancelTaskText}>Annuler</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.confirmTaskButton, { backgroundColor: primaryColor }]} 
                        onPress={() => addTask(category.permanent_category_id)}
                        data-testid="confirm-add-permanent-task"
                      >
                        <Text style={[styles.confirmTaskText, { color: secondaryColor }]}>Ajouter</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.addTaskButton} 
                    onPress={() => setShowAddTask(category.permanent_category_id)}
                    data-testid={`add-task-to-${category.permanent_category_id}`}
                  >
                    <WebIcon name="add-circle-outline" size={18} color={primaryColor} />
                    <Text style={[styles.addTaskButtonText, { color: primaryColor }]}>Ajouter une tâche</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ==================== MENU GROUPE SCREEN ====================
function MenuGroupeScreen(_props: any) { return null as any; }

// ==================== CREATE GROUP SCREEN ====================
function CreateGroupScreen(_props: any) { return null as any; }

// ==================== CLIENT MENU SELECTION SCREEN (Public) ====================
function ClientMenuSelectionScreen(_props: any) { return null as any; }

// ==================== PUBLIC GROUP REQUEST SCREEN (Formulaire public de demande de réservation) ====================

// ==================== STAFF GROUP VIEW SCREEN (Vue staff après scan QR) ====================
function StaffGroupViewScreen(_props: any) { return null as any; }

function PublicGroupRequestScreen(_props: any) { return null as any; }

// ==================== TRACK GROUP RESERVATION SCREEN (Suivi de réservation par le client) ====================
function TrackGroupReservationScreen(_props: any) { return null as any; }

// ==================== PUBLIC MENU SCREEN (QR Code) ====================
function PublicMenuScreen(_props: any) { return null as any; }

// ==================== FICHE TECHNIQUE SCREEN ====================
function FicheTechniqueScreen(_props: any) { return null as any; }

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

function MenuRestaurantScreen(_props: any) { return null as any; }

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
function MenuRestaurantDraftScreen(_props: any) { return null as any; }

// ==================== ORDER PREPARATION SCREEN ====================
function OrderPreparationScreen({ suppliers, products, orders, primaryColor, secondaryColor, apiRequest, loadSuppliers, loadProducts, loadOrders, isAdmin, sessionToken, userPrepPermissions = {} }: any) {
  const [currentView, setCurrentView] = useState<'suppliers' | 'order' | 'history' | 'confirmation' | 'supplierHistory'>('suppliers');
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedProducts, setSelectedProducts] = useState<{[key: string]: number}>({});  // product_id -> quantity
  const [isLoading, setIsLoading] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any>(null);  // Commande créée pour la confirmation
  
  // Permissions détaillées pour préparation commande
  const canAddSupplier = isAdmin || userPrepPermissions?.fournisseur?.ajouter;
  const canEditSupplier = isAdmin || userPrepPermissions?.fournisseur?.modifier;
  const canDeleteSupplier = isAdmin || userPrepPermissions?.fournisseur?.supprimer;
  const canAddProduct = isAdmin || userPrepPermissions?.produits?.ajouter;
  const canEditProduct = isAdmin || userPrepPermissions?.produits?.modifier;
  const canDeleteProduct = isAdmin || userPrepPermissions?.produits?.supprimer;
  const canAddConsigne = isAdmin || userPrepPermissions?.consignes?.ajouter;
  const canEditConsigne = isAdmin || userPrepPermissions?.consignes?.modifier;
  const canDeleteConsigne = isAdmin || userPrepPermissions?.consignes?.supprimer;
  
  // Filtre Cuisine/Bar
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'cuisine' | 'bar'>('all');
  
  // Calendrier modal pour dates de livraison
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarSupplier, setCalendarSupplier] = useState<any>(null);
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);  // 0 = mois actuel, -1 = mois précédent, 1 = mois suivant
  
  // Historique par fournisseur
  const [supplierHistoryOrders, setSupplierHistoryOrders] = useState<any[]>([]);
  const [historySupplierName, setHistorySupplierName] = useState('');
  
  // Modal PDF pour commandes/consignes
  const [showOrderPdfModal, setShowOrderPdfModal] = useState(false);
  const [orderPdfUrl, setOrderPdfUrl] = useState('');
  const [orderPdfTitle, setOrderPdfTitle] = useState('');
  
  // Rapport mensuel
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [monthlyReportStartDate, setMonthlyReportStartDate] = useState('');
  const [monthlyReportEndDate, setMonthlyReportEndDate] = useState('');
  const [monthlyReportData, setMonthlyReportData] = useState<any>(null);
  const [loadingMonthlyReport, setLoadingMonthlyReport] = useState(false);
  const [reportSupplierId, setReportSupplierId] = useState<string>('all');
  const [reportOrderType, setReportOrderType] = useState<string>('all');
  const [reportViewMode, setReportViewMode] = useState<string>('product'); // 'product' ou 'date'
  
  // Gestion des statuts de commandes
  const [orderStatusMenuOpen, setOrderStatusMenuOpen] = useState<string | null>(null);
  const [refundItemsSelection, setRefundItemsSelection] = useState<{[key: string]: string[]}>({});
  
  // Fonction pour mettre à jour le statut d'une commande
  const updateOrderStatus = async (orderId: string, newStatus: string, refundedItems?: string[], manualFullRefund?: boolean) => {
    try {
      const response = await apiRequest(`/supplier-orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus, 
          refunded_items: refundedItems,
          manual_full_refund: manualFullRefund || false
        })
      });
      
      // Recharger les commandes
      loadOrders();
      if (selectedSupplier) {
        // Recharger l'historique du fournisseur sélectionné
        const historyResponse = await apiRequest(`/suppliers/${selectedSupplier.supplier_id}/orders`);
        if (historyResponse && historyResponse.orders) {
          setSupplierHistoryOrders(historyResponse.orders);
        }
      }
      
      setOrderStatusMenuOpen(null);
      showAlert('Succès', `Statut mis à jour: ${newStatus}`);
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Toggle item pour remboursement
  const toggleRefundItem = (orderId: string, productName: string) => {
    setRefundItemsSelection(prev => {
      const current = prev[orderId] || [];
      if (current.includes(productName)) {
        return { ...prev, [orderId]: current.filter(p => p !== productName) };
      } else {
        return { ...prev, [orderId]: [...current, productName] };
      }
    });
  };
  
  // Supplier form
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<'bar' | 'cuisine' | 'both' | ''>('');
  const [deliveryDays, setDeliveryDays] = useState<number[]>([]);
  const [orderDeadlineDays, setOrderDeadlineDays] = useState<number[]>([]);
  const [orderDeadlineTime, setOrderDeadlineTime] = useState('19:00');
  
  // Product form
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState<'product' | 'consigne' | 'reclamation'>('product');
  const [consignePriceHT, setConsignePriceHT] = useState('');  // Prix HT pour les consignes
  const [productPriceHT, setProductPriceHT] = useState('');  // Prix HT optionnel pour les produits
  const [editingProduct, setEditingProduct] = useState<any>(null);  // Produit en cours d'édition
  
  // Réclamations state - par fournisseur
  const [reclamationsBySupplier, setReclamationsBySupplier] = useState<{[supplierId: string]: {name: string, quantity: number, price: number}[]}>({});
  const [newReclamationName, setNewReclamationName] = useState('');
  const [newReclamationQty, setNewReclamationQty] = useState('1');
  const [newReclamationPrice, setNewReclamationPrice] = useState('');
  
  // Réclamations pour le fournisseur sélectionné
  const currentReclamations = selectedSupplier ? (reclamationsBySupplier[selectedSupplier.supplier_id] || []) : [];
  
  const addReclamation = () => {
    if (newReclamationName && newReclamationPrice && selectedSupplier) {
      const supplierId = selectedSupplier.supplier_id;
      const newItem = {
        name: newReclamationName,
        quantity: parseInt(newReclamationQty) || 1,
        price: parseFloat(newReclamationPrice) || 0
      };
      setReclamationsBySupplier(prev => ({
        ...prev,
        [supplierId]: [...(prev[supplierId] || []), newItem]
      }));
      setNewReclamationName('');
      setNewReclamationQty('1');
      setNewReclamationPrice('');
    }
  };
  
  const removeReclamation = (idx: number) => {
    if (selectedSupplier) {
      const supplierId = selectedSupplier.supplier_id;
      setReclamationsBySupplier(prev => ({
        ...prev,
        [supplierId]: (prev[supplierId] || []).filter((_, i) => i !== idx)
      }));
    }
  };
  
  const sendReclamation = async () => {
    console.log('[sendReclamation] Function called');
    console.log('[sendReclamation] selectedSupplier:', selectedSupplier?.supplier_id);
    console.log('[sendReclamation] currentReclamations:', currentReclamations.length);
    
    if (!selectedSupplier || currentReclamations.length === 0) {
      console.log('[sendReclamation] Early return - no supplier or no reclamations');
      return;
    }
    
    try {
      const totalHT = currentReclamations.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // Créer une commande de type réclamation
      const reclamationOrder = {
        supplier_id: selectedSupplier.supplier_id,
        order_type: 'reclamation',
        items: currentReclamations.map(item => ({
          product_name: item.name,
          product_type: 'reclamation',
          quantity: item.quantity,
          price_ht: item.price
        })),
        total_ht: totalHT
      };
      
      console.log('[sendReclamation] Sending reclamation:', JSON.stringify(reclamationOrder));
      
      const response = await apiRequest('/supplier-orders/create', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reclamationOrder) 
      });
      
      console.log('[sendReclamation] Response:', response);
      
      // Vider les réclamations de ce fournisseur
      setReclamationsBySupplier(prev => ({
        ...prev,
        [selectedSupplier.supplier_id]: []
      }));
      
      // Use window.alert for web, Alert.alert for mobile
      const successMessage = `Réclamation envoyée à ${selectedSupplier.name} (${totalHT.toFixed(2)}€ HT)`;
      if (Platform.OS === 'web') {
        window.alert(successMessage);
      } else {
        showAlert('Succès', successMessage);
      }
      
      loadOrders();
    } catch (error: any) {
      console.error('[sendReclamation] Error:', error);
      const errorMessage = error.message || 'Erreur inconnue';
      if (Platform.OS === 'web') {
        window.alert('Erreur: ' + errorMessage);
      } else {
        showAlert('Erreur', errorMessage);
      }
    }
  };
  
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const fullDayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const monthNamesFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  
  // Générer le calendrier du mois avec offset
  const generateCalendarMonth = (offset: number = 0) => {
    const today = new Date();
    // Ajouter l'offset au mois actuel
    const targetDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Jour de la semaine du 1er (0=Dimanche, donc on ajuste pour Lundi=0)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const daysInMonth = lastDay.getDate();
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];
    
    // Remplir les jours vides avant le 1er
    for (let i = 0; i < startDay; i++) {
      currentWeek.push(null);
    }
    
    // Remplir les jours du mois
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    
    // Remplir les jours vides après le dernier jour
    while (currentWeek.length > 0 && currentWeek.length < 7) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
    
    return { year, month, weeks, monthName: monthNamesFr[month] };
  };
  
  // Vérifier si un jour est un jour de livraison ou commande
  const getDayType = (dayOfMonth: number, supplier: any, year: number, month: number) => {
    if (!dayOfMonth || !supplier?.delivery_schedule) return null;
    
    // Utiliser l'année et le mois du calendrier affiché (pas le mois actuel)
    const date = new Date(year, month, dayOfMonth);
    
    // Jour de la semaine (0=Lundi, 1=Mardi, ..., 6=Dimanche)
    let dayOfWeek = date.getDay() - 1;
    if (dayOfWeek < 0) dayOfWeek = 6;
    
    const deliveryDays = supplier.delivery_schedule?.delivery_days || [];
    const orderDays = supplier.delivery_schedule?.order_deadline_days || [];
    
    const isDelivery = deliveryDays.includes(dayOfWeek);
    const isOrder = orderDays.includes(dayOfWeek);
    
    if (isDelivery && isOrder) return 'both';
    if (isDelivery) return 'delivery';
    if (isOrder) return 'order';
    return null;
  };
  
  // Ouvrir le calendrier pour un fournisseur
  const openCalendar = (supplier: any, e: any) => {
    e.stopPropagation();
    setCalendarSupplier(supplier);
    setCalendarMonthOffset(0);  // Réinitialiser au mois actuel
    setShowCalendarModal(true);
  };

  const supplierProducts = products.filter((p: any) => p.supplier_id === selectedSupplier?.supplier_id);
  // Séparer les produits et consignes
  const productsList = supplierProducts.filter((p: any) => p.product_type !== 'consigne');
  const consignesList = supplierProducts.filter((p: any) => p.product_type === 'consigne');
  
  const toggleDeliveryDay = (day: number) => {
    setDeliveryDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };
  
  const toggleOrderDeadlineDay = (day: number) => {
    setOrderDeadlineDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };
  
  // Charger l'historique d'un fournisseur
  const loadSupplierHistory = async (supplier: any) => {
    setIsLoading(true);
    try {
      const data = await apiRequest(`/suppliers/${supplier.supplier_id}/orders`);
      setSupplierHistoryOrders(data.orders || []);
      setHistorySupplierName(data.supplier_name || supplier.name);
      setSelectedSupplier(supplier);
      setCurrentView('supplierHistory');
    } catch (error: any) {
      if (typeof window !== 'undefined') {
        window.alert('Erreur: ' + error.message);
      } else {
        showAlert('Erreur', error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const createSupplier = async () => {
    if (!supplierName.trim()) { showAlert('Erreur', 'Veuillez entrer un nom de fournisseur'); return; }
    setIsLoading(true);
    try {
      await apiRequest('/suppliers/create', {
        method: 'POST',
        body: JSON.stringify({
          name: supplierName.trim(),
          phone: supplierPhone.trim() || null,
          supplier_category: supplierCategory || null,
          delivery_schedule: {
            delivery_days: deliveryDays,
            order_deadline_days: orderDeadlineDays,
            order_deadline_time: orderDeadlineTime,
            delivery_time: null
          }
        })
      });
      resetSupplierForm();
      setShowAddSupplier(false);
      loadSuppliers();
      showAlert('Succès', 'Fournisseur créé !');
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  const updateSupplier = async () => {
    if (!supplierName.trim()) { showAlert('Erreur', 'Veuillez entrer un nom de fournisseur'); return; }
    setIsLoading(true);
    try {
      await apiRequest(`/suppliers/${selectedSupplier.supplier_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: supplierName.trim(),
          phone: supplierPhone.trim() || null,
          supplier_category: supplierCategory || null,
          delivery_schedule: {
            delivery_days: deliveryDays,
            order_deadline_days: orderDeadlineDays,
            order_deadline_time: orderDeadlineTime,
            delivery_time: null
          }
        })
      });
      setShowEditSupplier(false);
      loadSuppliers();
      showAlert('Succès', 'Fournisseur mis à jour !');
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  const deleteSupplier = async (supplierId: string | undefined) => {
    if (!supplierId) {
      console.error('deleteSupplier: supplierId is undefined');
      return;
    }
    
    // Sur le web, utiliser window.confirm
    if (typeof window !== 'undefined') {
      const confirmed = await showConfirm('Voulez-vous vraiment supprimer ce fournisseur ?');
      if (!confirmed) return;
      
      try {
        await apiRequest(`/suppliers/${supplierId}`, { method: 'DELETE' });
        loadSuppliers();
        setSelectedSupplier(null);
        setCurrentView('suppliers');
        setShowEditSupplier(false);
      } catch (error: any) { 
        window.alert('Erreur: ' + error.message); 
      }
    } else {
      // Sur mobile, utiliser Alert.alert
      showAlert('Confirmer', 'Voulez-vous vraiment supprimer ce fournisseur ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await apiRequest(`/suppliers/${supplierId}`, { method: 'DELETE' });
            loadSuppliers();
            setSelectedSupplier(null);
            setCurrentView('suppliers');
            setShowEditSupplier(false);
          } catch (error: any) { showAlert('Erreur', error.message); }
        }}
      ]);
    }
  };
  
  const resetSupplierForm = () => {
    setSupplierName('');
    setSupplierPhone('');
    setSupplierCategory('');
    setDeliveryDays([]);
    setOrderDeadlineDays([]);
    setOrderDeadlineTime('19:00');
  };
  
  const editSupplier = (supplier: any) => {
    setSupplierName(supplier.name);
    setSupplierPhone(supplier.phone || '');
    setSupplierCategory(supplier.supplier_category || '');
    setDeliveryDays(supplier.delivery_schedule?.delivery_days || []);
    setOrderDeadlineDays(supplier.delivery_schedule?.order_deadline_days || []);
    setOrderDeadlineTime(supplier.delivery_schedule?.order_deadline_time || '19:00');
    setShowEditSupplier(true);
  };
  
  const createProduct = async () => {
    if (!productName.trim()) { showAlert('Erreur', 'Veuillez entrer un nom de produit'); return; }
    setIsLoading(true);
    try {
      const productData: any = {
        supplier_id: selectedSupplier.supplier_id,
        name: productName.trim(),
        product_type: productType
      };
      
      // Ajouter le prix pour les consignes
      if (productType === 'consigne' && consignePriceHT) {
        const price = parseFloat(consignePriceHT.replace(',', '.'));
        if (!isNaN(price) && price > 0) {
          productData.price_ht = price;
        }
      }
      
      // Ajouter le prix optionnel pour les produits
      if (productType === 'product' && productPriceHT) {
        const price = parseFloat(productPriceHT.replace(',', '.'));
        if (!isNaN(price) && price > 0) {
          productData.price_ht = price;
        }
      }
      
      if (editingProduct) {
        // Mode édition
        await apiRequest(`/supplier-products/${editingProduct.product_id}`, {
          method: 'PUT',
          body: JSON.stringify(productData)
        });
      } else {
        // Mode création
        await apiRequest('/supplier-products/create', {
          method: 'POST',
          body: JSON.stringify(productData)
        });
      }
      
      setProductName('');
      setProductType('product');
      setConsignePriceHT('');
      setProductPriceHT('');
      setEditingProduct(null);
      setShowAddProduct(false);
      loadProducts();
    } catch (error: any) { showAlert('Erreur', error.message); }
    finally { setIsLoading(false); }
  };
  
  const openEditProduct = (product: any) => {
    setProductName(product.name || '');
    setProductType(product.product_type || 'product');
    if (product.product_type === 'consigne') {
      setConsignePriceHT(product.price_ht ? product.price_ht.toString() : '');
    } else {
      setProductPriceHT(product.price_ht ? product.price_ht.toString() : '');
    }
    setEditingProduct(product);
    setShowAddProduct(true);
  };
  
  const deleteProduct = async (productId: string) => {
    try {
      await apiRequest(`/supplier-products/${productId}`, { method: 'DELETE' });
      loadProducts();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };
  
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      if (prev[productId] !== undefined) {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      } else {
        return { ...prev, [productId]: 1 };
      }
    });
  };
  
  const updateQuantity = (productId: string, delta: number) => {
    setSelectedProducts(prev => {
      const current = prev[productId] || 0;
      const newQty = Math.max(1, current + delta);
      return { ...prev, [productId]: newQty };
    });
  };
  
  const createOrder = async () => {
    const items = Object.entries(selectedProducts).map(([productId, quantity]) => {
      const product = products.find((p: any) => p.product_id === productId);
      // Vérifier aussi dans consignesList pour obtenir le prix
      const consigneProduct = consignesList.find((c: any) => c.product_id === productId);
      // Déterminer le type: si le produit a product_type='consigne' OU s'il est dans consignesList
      const isConsigne = product?.product_type === 'consigne' || consigneProduct !== undefined;
      const itemProductType = isConsigne ? 'consigne' : 'product';
      
      // Obtenir le prix HT si c'est une consigne
      const priceHT = isConsigne ? (consigneProduct?.price_ht || product?.price_ht || 0) : 0;
      
      return {
        product_id: productId,
        product_name: product?.name || consigneProduct?.name || '',
        product_type: itemProductType,
        quantity,
        price_ht: priceHT > 0 ? priceHT : undefined
      };
    });
    
    if (items.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('Veuillez sélectionner au moins un produit');
      } else {
        showAlert('Erreur', 'Veuillez sélectionner au moins un produit');
      }
      return;
    }
    
    // Calculer le total HT pour les consignes
    const totalHT = items.reduce((sum, item) => {
      return sum + ((item.price_ht || 0) * item.quantity);
    }, 0);
    
    setIsLoading(true);
    try {
      const order = await apiRequest('/supplier-orders/create', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: selectedSupplier.supplier_id,
          items,
          total_ht: totalHT > 0 ? totalHT : undefined
        })
      });
      
      // Stocker la commande créée et aller vers la vue de confirmation
      setCreatedOrder({
        ...order,
        items,
        supplier_name: selectedSupplier.name,
        supplier_phone: selectedSupplier.phone
      });
      setSelectedProducts({});
      loadOrders();
      setCurrentView('confirmation');
    } catch (error: any) { 
      if (typeof window !== 'undefined') {
        window.alert('Erreur: ' + error.message);
      } else {
        showAlert('Erreur', error.message);
      }
    }
    finally { setIsLoading(false); }
  };
  
  // Fonction utilitaire pour télécharger un PDF - Utilise la fonction globale downloadOrShareFile
  const downloadPdfFile = async (pdfUrl: string, filename: string) => {
    await downloadOrShareFile(pdfUrl, filename, 'application/pdf');
  };

  const downloadOrderPDF = (orderId: string, orderTitle?: string) => {
    const backendUrl = API_BASE_URL;
    const token = sessionToken || '';
    const pdfUrl = `${backendUrl}/api/supplier-orders/${orderId}/pdf?token=${encodeURIComponent(token)}`;
    const filename = `${(orderTitle || 'Commande').replace(/\s/g, '_')}.pdf`;
    downloadPdfFile(pdfUrl, filename);
  };
  
  const downloadOrderPdfFile = async () => {
    if (orderPdfUrl && typeof window !== 'undefined') {
      const filename = `${orderPdfTitle.replace(/\s/g, '_')}.pdf`;
      await downloadOrShareFile(orderPdfUrl, filename, 'application/pdf');
    }
  };
  
  const closeOrderPdfModal = () => {
    setShowOrderPdfModal(false);
    setOrderPdfUrl('');
    setOrderPdfTitle('');
  };
  
  // Rapport mensuel
  const loadMonthlyReport = async () => {
    if (!monthlyReportStartDate || !monthlyReportEndDate) {
      alert('Veuillez sélectionner les dates de début et de fin');
      return;
    }
    setLoadingMonthlyReport(true);
    try {
      let url = `/supplier-orders/monthly-report?start_date=${monthlyReportStartDate}&end_date=${monthlyReportEndDate}`;
      if (reportSupplierId && reportSupplierId !== 'all') {
        url += `&supplier_id=${reportSupplierId}`;
      }
      if (reportOrderType && reportOrderType !== 'all') {
        url += `&order_type=${reportOrderType}`;
      }
      if (reportViewMode) {
        url += `&view_mode=${reportViewMode}`;
      }
      const data = await apiRequest(url);
      setMonthlyReportData(data);
    } catch (error: any) {
      console.error('Report error:', error);
      alert('Erreur: ' + (error.message || 'Impossible de charger le rapport'));
    } finally {
      setLoadingMonthlyReport(false);
    }
  };
  
  const downloadMonthlyReportPdf = async () => {
    if (!monthlyReportStartDate || !monthlyReportEndDate) return;
    const token = sessionToken || '';
    let pdfUrl = `${API_BASE_URL}/api/supplier-orders/monthly-report/pdf?start_date=${monthlyReportStartDate}&end_date=${monthlyReportEndDate}&token=${encodeURIComponent(token)}`;
    if (reportSupplierId && reportSupplierId !== 'all') {
      pdfUrl += `&supplier_id=${reportSupplierId}`;
    }
    if (reportOrderType && reportOrderType !== 'all') {
      pdfUrl += `&order_type=${reportOrderType}`;
    }
    if (reportViewMode && reportViewMode !== 'product') {
      pdfUrl += `&view_mode=${reportViewMode}`;
    }
    
    // Télécharger directement via la fonction universelle PWA
    const filename = `Rapport_${reportViewMode === 'date' ? 'par_Date' : 'par_Produit'}_${monthlyReportStartDate}_${monthlyReportEndDate}.pdf`;
    await downloadOrShareFile(pdfUrl, filename, 'application/pdf');
  };
  
  // Initialiser les dates du mois en cours pour le rapport
  const initMonthlyReportDates = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setMonthlyReportStartDate(firstDay.toISOString().split('T')[0]);
    setMonthlyReportEndDate(lastDay.toISOString().split('T')[0]);
    setMonthlyReportData(null);
    setReportSupplierId('all');
    setReportOrderType('all');
    setShowMonthlyReport(true);
  };
  
  const shareOrderWhatsApp = (order: any) => {
    if (!order) return;
    
    // Déterminer le type de commande
    const hasProducts = order.items.some((item: any) => item.product_type !== 'consigne');
    const hasConsignes = order.items.some((item: any) => item.product_type === 'consigne');
    const isOnlyConsignes = hasConsignes && !hasProducts;
    
    const itemsList = order.items.map((item: any) => `• ${item.product_name}: ${item.quantity}`).join('\n');
    const today = new Date().toLocaleDateString('fr-FR');
    const docType = isOnlyConsignes ? 'Consigne' : 'Commande';
    const emoji = isOnlyConsignes ? '🍾' : '📦';
    const message = `${emoji} *${docType} - ${order.supplier_name}*\n\n📅 Date: ${today}\n\n${itemsList}\n\nMerci !`;
    
    // Utiliser le numéro du fournisseur s'il est disponible
    const phoneNumber = order.supplier_phone ? order.supplier_phone.replace(/\s/g, '').replace(/^0/, '33') : '';
    
    if (typeof window !== 'undefined') {
      if (phoneNumber) {
        // Ouvrir WhatsApp avec le numéro du commercial
        window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');
      } else {
        // Ouvrir WhatsApp sans numéro (l'utilisateur choisira)
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      }
    }
  };
  
  const shareOrderEmail = (order: any) => {
    if (!order) return;
    
    // Déterminer le type de commande
    const hasProducts = order.items.some((item: any) => item.product_type !== 'consigne');
    const hasConsignes = order.items.some((item: any) => item.product_type === 'consigne');
    const isOnlyConsignes = hasConsignes && !hasProducts;
    
    const itemsList = order.items.map((item: any) => `- ${item.product_name}: ${item.quantity}`).join('\n');
    const today = new Date().toLocaleDateString('fr-FR');
    const docType = isOnlyConsignes ? 'Consigne' : 'Commande';
    const subject = `${docType} - ${order.supplier_name} - ${today}`;
    const intro = isOnlyConsignes ? 'Veuillez trouver ci-dessous nos consignes rendues:' : 'Veuillez trouver ci-dessous notre commande:';
    const body = `Bonjour,\n\n${intro}\n\n${itemsList}\n\nCordialement`;
    
    if (typeof window !== 'undefined') {
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }
  };

  const shareOrder = (orderId: string, method: 'whatsapp' | 'email' | 'sms') => {
    const order = orders.find((o: any) => o.order_id === orderId);
    if (!order) return;
    
    const itemsList = order.items.map((item: any) => `- ${item.product_name}: ${item.quantity}`).join('\n');
    const message = `Commande ${order.supplier_name}\n${itemsList}`;
    
    if (typeof window !== 'undefined') {
      if (method === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      } else if (method === 'email') {
        window.open(`mailto:?subject=Commande ${order.supplier_name}&body=${encodeURIComponent(message)}`, '_blank');
      } else if (method === 'sms') {
        window.open(`sms:?body=${encodeURIComponent(message)}`, '_blank');
      }
    }
  };
  
  const selectSupplierForOrder = (supplier: any) => {
    setSelectedSupplier(supplier);
    setSelectedProducts({});
    setCurrentView('order');
  };
  
  // Vue de l'historique d'un fournisseur spécifique
  if (currentView === 'supplierHistory' && selectedSupplier) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        {/* Header avec retour */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={() => setCurrentView('suppliers')} style={{ marginRight: 12 }}>
            <WebIcon name="arrow-back" size={24} color={primaryColor} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>
              📜 Historique - {historySupplierName}
            </Text>
          </View>
        </View>
        
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        ) : supplierHistoryOrders.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#666', fontSize: 16 }}>Aucune commande pour ce fournisseur</Text>
          </View>
        ) : (
          <ScrollView>
            {supplierHistoryOrders.map((order: any) => {
              const orderDate = new Date(order.created_at);
              const formattedDate = orderDate.toLocaleDateString('fr-FR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              
              // Déterminer le type de commande
              const hasProducts = order.items?.some((item: any) => item.product_type !== 'consigne' && item.product_type !== 'reclamation');
              const hasConsignes = order.items?.some((item: any) => item.product_type === 'consigne');
              const hasReclamations = order.items?.some((item: any) => item.product_type === 'reclamation');
              const orderType = order.order_type || (hasReclamations ? 'reclamation' : (hasConsignes && !hasProducts ? 'consigne' : 'commande'));
              
              const typeConfig = {
                commande: { label: 'Commande', color: '#1976d2', bgColor: '#e3f2fd', emoji: '📦' },
                consigne: { label: 'Consigne', color: '#7b1fa2', bgColor: '#f3e5f5', emoji: '🍾' },
                reclamation: { label: 'Réclamation', color: '#d32f2f', bgColor: '#ffebee', emoji: '⚠️' }
              };
              const typeInfo = typeConfig[orderType as keyof typeof typeConfig] || typeConfig.commande;
              
              // Labels de statut selon le type
              const getStatusInfo = (status: string, type: string, isConsigne: boolean) => {
                if (type === 'reclamation') {
                  switch(status) {
                    case 'to_request': return { label: 'À demander', color: '#ff9800', bgColor: '#fff3e0' };
                    case 'requested': return { label: 'Demandé', color: '#2196f3', bgColor: '#e3f2fd' };
                    case 'partial_refund': return { label: 'Remboursé partiel', color: '#9c27b0', bgColor: '#f3e5f5' };
                    case 'full_refund': return { label: 'Remboursé', color: '#4caf50', bgColor: '#e8f5e9' };
                    default: return { label: status, color: '#757575', bgColor: '#f5f5f5' };
                  }
                } else if (isConsigne) {
                  switch(status) {
                    case 'sent': return { label: 'Envoyé', color: '#ff9800', bgColor: '#fff3e0' };
                    case 'partial_refund': return { label: 'Remboursé partiel', color: '#2196f3', bgColor: '#e3f2fd' };
                    case 'full_refund': return { label: 'Remboursé total', color: '#4caf50', bgColor: '#e8f5e9' };
                    default: return { label: status, color: '#757575', bgColor: '#f5f5f5' };
                  }
                } else {
                  switch(status) {
                    case 'to_order': return { label: 'À commander', color: '#ff9800', bgColor: '#fff3e0' };
                    case 'ordered': return { label: 'Commandé', color: '#2196f3', bgColor: '#e3f2fd' };
                    case 'delivered': return { label: 'Livré', color: '#4caf50', bgColor: '#e8f5e9' };
                    case 'cancelled': return { label: 'Annulé', color: '#f44336', bgColor: '#ffebee' };
                    default: return { label: status, color: '#757575', bgColor: '#f5f5f5' };
                  }
                }
              };
              
              const isConsigne = order.is_only_consignes || orderType === 'consigne';
              const statusInfo = getStatusInfo(order.status, orderType, isConsigne);
              
              return (
                <View 
                  key={order.order_id}
                  style={{ 
                    backgroundColor: '#fff', 
                    padding: 16, 
                    borderRadius: 10, 
                    marginBottom: 12,
                    borderLeftWidth: 4,
                    borderLeftColor: statusInfo.color
                  }}
                >
                  {/* Header avec date, type et statut sur la même ligne */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, color: '#666' }}>{formattedDate}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Badge type de commande */}
                      <View style={{ 
                        paddingHorizontal: 8, 
                        paddingVertical: 4, 
                        borderRadius: 6,
                        backgroundColor: typeInfo.bgColor,
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginRight: 8
                      }}>
                        <Text style={{ fontSize: 11 }}>{typeInfo.emoji} </Text>
                        <Text style={{ 
                          fontSize: 11, 
                          fontWeight: 'bold',
                          color: typeInfo.color
                        }}>
                          {typeInfo.label}
                        </Text>
                      </View>
                      {/* Badge statut */}
                      <View style={{ 
                        paddingHorizontal: 10, 
                        paddingVertical: 4, 
                        borderRadius: 6,
                        backgroundColor: statusInfo.bgColor
                      }}>
                        <Text style={{ 
                          fontSize: 11, 
                          fontWeight: 'bold',
                          color: statusInfo.color
                        }}>
                          {statusInfo.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    Par {order.created_by_name || 'Inconnu'}
                  </Text>
                  
                  <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }}>
                    {order.items?.map((item: any, idx: number) => {
                      const isRefunded = item.is_refunded;
                      const isSelected = (refundItemsSelection[order.order_id] || []).includes(item.product_name);
                      const showCheckbox = (isConsigne || orderType === 'reclamation') && orderStatusMenuOpen === order.order_id;
                      
                      return (
                        <Pressable 
                          key={idx} 
                          onPress={() => showCheckbox && toggleRefundItem(order.order_id, item.product_name)}
                          style={{ 
                            flexDirection: 'row', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            paddingVertical: 6,
                            backgroundColor: isRefunded ? '#e8f5e9' : (isSelected ? '#fff3e0' : 'transparent'),
                            paddingHorizontal: 8,
                            marginHorizontal: -8,
                            borderRadius: 4
                          }}
                        >
                          {showCheckbox && (
                            <View style={{ 
                              width: 22, 
                              height: 22, 
                              borderRadius: 4, 
                              borderWidth: 2, 
                              borderColor: isRefunded ? '#4caf50' : (isSelected ? '#ff9800' : '#ccc'),
                              backgroundColor: isRefunded || isSelected ? (isRefunded ? '#4caf50' : '#ff9800') : 'transparent',
                              marginRight: 10,
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {(isRefunded || isSelected) && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                            </View>
                          )}
                          <Text style={{ 
                            color: isRefunded ? '#4caf50' : '#333', 
                            flex: 1,
                            textDecorationLine: isRefunded ? 'line-through' : 'none'
                          }}>
                            {item.product_name}
                          </Text>
                          <Text style={{ color: primaryColor, fontWeight: 'bold' }}>{item.quantity}</Text>
                          {/* Afficher le prix pour réclamations et consignes */}
                          {(orderType === 'reclamation' || isConsigne || orderType === 'consigne') && item.price_ht && item.price_ht > 0 && (
                            <Text style={{ color: '#666', marginLeft: 8, fontSize: 12 }}>{item.price_ht.toFixed(2)}€</Text>
                          )}
                        </Pressable>
                      );
                    })}
                    
                    {/* Afficher le total HT pour les consignes et réclamations */}
                    {(orderType === 'reclamation' || isConsigne || orderType === 'consigne') && order.total_ht > 0 && (
                      <View style={{ 
                        borderTopWidth: 1, 
                        borderTopColor: '#ddd', 
                        marginTop: 8, 
                        paddingTop: 8,
                        flexDirection: 'row',
                        justifyContent: 'flex-end'
                      }}>
                        <Text style={{ fontWeight: 'bold', color: '#333' }}>
                          Total: <Text style={{ color: primaryColor }}>{order.total_ht.toFixed(2)}€ HT</Text>
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Menu de changement de statut */}
                  {orderStatusMenuOpen === order.order_id && (
                    <View style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginTop: 10 }}>
                      <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#333' }}>
                        {isConsigne || orderType === 'reclamation' ? 'Sélectionnez les produits remboursés' : 'Changer le statut'}
                      </Text>
                      
                      {/* Boutons selon le type */}
                      {!isConsigne && orderType !== 'reclamation' ? (
                        // Commandes: À commander → Commandé → Livré
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => updateOrderStatus(order.order_id, 'to_order')}
                            style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? '#e65100' : '#ff9800', padding: 10, borderRadius: 6, alignItems: 'center' })}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>À commander</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => updateOrderStatus(order.order_id, 'ordered')}
                            style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? '#1565c0' : '#2196f3', padding: 10, borderRadius: 6, alignItems: 'center' })}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Commandé</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => updateOrderStatus(order.order_id, 'delivered')}
                            style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? '#2e7d32' : '#4caf50', padding: 10, borderRadius: 6, alignItems: 'center' })}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Livré</Text>
                          </Pressable>
                        </View>
                      ) : (
                        // Consignes/Réclamations: avec sélection de produits
                        <View>
                          {/* Boutons de statut pour réclamations (À demander → Demandé) - toujours visibles pour les réclamations */}
                          {orderType === 'reclamation' && (
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#333', fontSize: 12 }}>
                                Statut de la demande :
                              </Text>
                              <View style={{ flexDirection: 'row' }}>
                                <Pressable
                                  onPress={() => updateOrderStatus(order.order_id, 'to_request')}
                                  style={({ pressed }) => ({ 
                                    flex: 1, 
                                    backgroundColor: order.status === 'to_request' ? '#ff9800' : (pressed ? '#e65100' : '#ffb74d'),
                                    padding: 10, 
                                    borderRadius: 6, 
                                    alignItems: 'center',
                                    marginRight: 4,
                                    borderWidth: order.status === 'to_request' ? 2 : 0,
                                    borderColor: '#e65100'
                                  })}
                                >
                                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>À demander</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => updateOrderStatus(order.order_id, 'requested')}
                                  style={({ pressed }) => ({ 
                                    flex: 1, 
                                    backgroundColor: order.status === 'requested' ? '#2196f3' : (pressed ? '#1565c0' : '#64b5f6'),
                                    padding: 10, 
                                    borderRadius: 6, 
                                    alignItems: 'center',
                                    marginLeft: 4,
                                    borderWidth: order.status === 'requested' ? 2 : 0,
                                    borderColor: '#1565c0'
                                  })}
                                >
                                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>Demandé</Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                          
                          {/* Titre pour sélection remboursement */}
                          <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#333', fontSize: 12 }}>
                            Marquer comme remboursé :
                          </Text>
                          
                          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                            <Pressable
                              onPress={() => {
                                const selectedItems = refundItemsSelection[order.order_id] || [];
                                if (selectedItems.length > 0) {
                                  updateOrderStatus(order.order_id, 'partial_refund', selectedItems);
                                }
                              }}
                              style={({ pressed }) => ({ 
                                flex: 1, 
                                backgroundColor: (refundItemsSelection[order.order_id] || []).length > 0 
                                  ? (pressed ? '#7b1fa2' : '#9c27b0') 
                                  : '#ccc', 
                                padding: 10, 
                                borderRadius: 6, 
                                alignItems: 'center',
                                marginRight: 4
                              })}
                            >
                              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>
                                Valider sélection ({(refundItemsSelection[order.order_id] || []).length})
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => updateOrderStatus(order.order_id, 'full_refund', undefined, true)}
                              style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? '#2e7d32' : '#4caf50', padding: 10, borderRadius: 6, alignItems: 'center', marginLeft: 4 })}
                            >
                              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>Tout remboursé</Text>
                            </Pressable>
                          </View>
                          <Pressable
                            onPress={() => setOrderStatusMenuOpen(null)}
                            style={{ backgroundColor: '#eee', padding: 8, borderRadius: 6, alignItems: 'center' }}
                          >
                            <Text style={{ color: '#666', fontSize: 12 }}>Fermer</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  )}
                  
                  {/* Boutons d'action */}
                  <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                    {/* Bouton de statut */}
                    <Pressable 
                      onPress={() => setOrderStatusMenuOpen(orderStatusMenuOpen === order.order_id ? null : order.order_id)}
                      style={({ pressed }) => ({ 
                        flex: 1, 
                        backgroundColor: pressed ? '#455a64' : statusInfo.color, 
                        paddingVertical: 10, 
                        borderRadius: 6, 
                        alignItems: 'center' 
                      })}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>
                        {statusInfo.label} ▼
                      </Text>
                    </Pressable>
                    <TouchableOpacity 
                      style={{ 
                        flex: 1, 
                        backgroundColor: primaryColor, 
                        paddingVertical: 10, 
                        borderRadius: 6, 
                        alignItems: 'center' 
                      }}
                      onPress={() => downloadOrderPDF(order.order_id, `${order.order_type === 'consigne' ? 'Consigne' : order.order_type === 'reclamation' ? 'Réclamation' : 'Commande'} - ${order.supplier_name}`)}
                    >
                      <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 13 }}>📄 PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ 
                        flex: 1, 
                        backgroundColor: '#25D366', 
                        paddingVertical: 10, 
                        borderRadius: 6, 
                        alignItems: 'center' 
                      }}
                      onPress={() => shareOrder(order.order_id, 'whatsapp')}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>💬</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }
  
  // Vue de confirmation après création de commande
  if (currentView === 'confirmation' && createdOrder) {
    // Déterminer le type de commande (produits, consignes, ou mixte)
    const hasProducts = createdOrder.items.some((item: any) => item.product_type !== 'consigne');
    const hasConsignes = createdOrder.items.some((item: any) => item.product_type === 'consigne');
    
    // Définir le titre et le texte selon le type
    const isOnlyConsignes = hasConsignes && !hasProducts;
    const confirmationTitle = isOnlyConsignes ? 'Consigne rendue !' : 'Commande envoyée !';
    const confirmationSubtitle = isOnlyConsignes 
      ? `Vos consignes pour ${createdOrder.supplier_name} ont été enregistrées`
      : `Votre commande pour ${createdOrder.supplier_name} a été créée`;
    const recapTitle = isOnlyConsignes ? '📋 Récapitulatif Consigne' : '📋 Récapitulatif Commande';
    const confirmationColor = isOnlyConsignes ? '#795548' : '#4caf50';  // Marron pour consignes, vert pour commandes
    const confirmationIcon = isOnlyConsignes ? '🍾' : '✓';
    
    return (
      <View style={{ flex: 1, padding: 16 }}>
        {/* Succès */}
        <View style={{ alignItems: 'center', paddingVertical: 30 }}>
          <View style={{ 
            width: 80, 
            height: 80, 
            borderRadius: 40, 
            backgroundColor: confirmationColor, 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: 16
          }}>
            <Text style={{ color: '#fff', fontSize: 40 }}>{confirmationIcon}</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor, marginBottom: 8 }}>
            {confirmationTitle}
          </Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center' }}>
            {confirmationSubtitle}
          </Text>
        </View>
        
        {/* Récapitulatif */}
        <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 10, marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor, marginBottom: 12 }}>
            {recapTitle}
          </Text>
          {createdOrder.items.map((item: any, idx: number) => (
            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: idx < createdOrder.items.length - 1 ? 1 : 0, borderBottomColor: '#eee' }}>
              <Text style={{ color: '#333', flex: 1 }}>{item.product_name}</Text>
              <Text style={{ color: primaryColor, fontWeight: 'bold' }}>{item.quantity}</Text>
            </View>
          ))}
        </View>
        
        {/* Boutons de partage */}
        <View style={{ gap: 12 }}>
          {/* Télécharger PDF */}
          <TouchableOpacity 
            style={{ 
              backgroundColor: primaryColor, 
              paddingVertical: 16, 
              borderRadius: 10, 
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onPress={() => downloadOrderPDF(createdOrder.order_id, `${createdOrder.order_type === 'consigne' ? 'Consigne' : 'Commande'} - ${createdOrder.supplier_name || 'Fournisseur'}`)}
          >
            <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 16 }}>
              📄 Télécharger le PDF
            </Text>
          </TouchableOpacity>
          
          {/* Partager WhatsApp */}
          <TouchableOpacity 
            style={{ 
              backgroundColor: '#25D366', 
              paddingVertical: 16, 
              borderRadius: 10, 
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onPress={() => shareOrderWhatsApp(createdOrder)}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
              💬 Envoyer sur WhatsApp
            </Text>
          </TouchableOpacity>
          
          {/* Partager Email */}
          <TouchableOpacity 
            style={{ 
              backgroundColor: '#666', 
              paddingVertical: 16, 
              borderRadius: 10, 
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onPress={() => shareOrderEmail(createdOrder)}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
              ✉️ Envoyer par Email
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Bouton Terminer */}
        <TouchableOpacity 
          style={{ 
            marginTop: 30,
            paddingVertical: 12, 
            alignItems: 'center'
          }}
          onPress={() => {
            setCreatedOrder(null);
            setCurrentView('suppliers');
          }}
        >
          <Text style={{ color: primaryColor, fontSize: 16 }}>Retour aux fournisseurs</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Liste des fournisseurs
  if (currentView === 'suppliers') {
    // Filtrer les fournisseurs par catégorie (basé sur les produits qu'ils ont)
    // Filtrer les fournisseurs par leur catégorie (Bar/Cuisine/Both)
    const filteredSuppliers = categoryFilter === 'all' ? suppliers : suppliers.filter((supplier: any) => {
      // Si le fournisseur a une catégorie définie, utiliser cette catégorie
      if (supplier.supplier_category) {
        if (supplier.supplier_category === 'both') {
          return true; // "Bar et Cuisine" s'affiche dans Bar ET Cuisine
        }
        return supplier.supplier_category === categoryFilter;
      }
      // Sinon, fallback sur la logique des produits
      const supplierProducts = products.filter((p: any) => p.supplier_id === supplier.supplier_id);
      return supplierProducts.some((p: any) => p.category === categoryFilter || p.category === 'both');
    });
    
    return (
      <ScrollView style={{ flex: 1, padding: 16 }} data-testid="order-prep-screen">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: primaryColor }}>Préparation de commande</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity 
              onPress={initMonthlyReportDates}
              style={{ backgroundColor: '#6c757d', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
              data-testid="rapport-mensuel-btn"
            >
              <WebIcon name="stats-chart-outline" size={16} color="white" />
              <Text style={{ color: 'white', fontWeight: '600', marginLeft: 4, fontSize: 13 }}>Rapport</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCurrentView('history')} style={{ padding: 8 }}>
              <Text style={{ color: primaryColor }}>Historique</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Modal Rapport Mensuel */}
        <Modal visible={showMonthlyReport} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: 'white', width: '95%', maxWidth: 700, maxHeight: '90%', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: primaryColor }}>
                <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>📊 Rapport {reportViewMode === 'date' ? 'par Date' : 'par Produit'}</Text>
                <TouchableOpacity onPress={() => setShowMonthlyReport(false)}>
                  <WebIcon name="close" size={24} color={secondaryColor} />
                </TouchableOpacity>
              </View>
              
              {/* Filtres */}
              <View style={{ padding: 16, backgroundColor: '#f5f5f5' }}>
                {/* Ligne 1: Fournisseur, Type et Mode */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 150 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 4, fontSize: 13 }}>Fournisseur:</Text>
                    <select 
                      value={reportSupplierId}
                      onChange={(e) => setReportSupplierId(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                    >
                      <option value="all">Tous les fournisseurs</option>
                      {suppliers.map((s: any) => (
                        <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
                      ))}
                    </select>
                  </View>
                  <View style={{ flex: 1, minWidth: 150 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 4, fontSize: 13 }}>Type:</Text>
                    <select 
                      value={reportOrderType}
                      onChange={(e) => setReportOrderType(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                    >
                      <option value="all">Tous</option>
                      <option value="command">Commandes</option>
                      <option value="consigne">Consignes</option>
                      <option value="reclamation">Réclamations</option>
                    </select>
                  </View>
                  <View style={{ flex: 1, minWidth: 150 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 4, fontSize: 13 }}>Mode:</Text>
                    <select 
                      value={reportViewMode}
                      onChange={(e) => setReportViewMode(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, backgroundColor: '#fff8e1' }}
                    >
                      <option value="product">Par Produit</option>
                      <option value="date">Par Date</option>
                    </select>
                  </View>
                </View>
                
                {/* Ligne 2: Dates et boutons */}
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <View style={{ minWidth: 130 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 4, fontSize: 13 }}>Du:</Text>
                    <input 
                      type="date" 
                      value={monthlyReportStartDate}
                      onChange={(e) => setMonthlyReportStartDate(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                    />
                  </View>
                  <View style={{ minWidth: 130 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 4, fontSize: 13 }}>Au:</Text>
                    <input 
                      type="date" 
                      value={monthlyReportEndDate}
                      onChange={(e) => setMonthlyReportEndDate(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                    />
                  </View>
                  <TouchableOpacity 
                    onPress={loadMonthlyReport}
                    disabled={loadingMonthlyReport}
                    style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
                  >
                    <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>
                      {loadingMonthlyReport ? 'Chargement...' : 'Générer'}
                    </Text>
                  </TouchableOpacity>
                  {monthlyReportData && (
                    <TouchableOpacity 
                      onPress={downloadMonthlyReportPdf}
                      style={{ backgroundColor: '#2E7D32', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <WebIcon name="download-outline" size={18} color="white" />
                      <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 6 }}>PDF</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              {/* Contenu du rapport */}
              <ScrollView style={{ flex: 1, padding: 16 }}>
                {loadingMonthlyReport ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <Text style={{ marginTop: 12, color: '#666' }}>Chargement du rapport...</Text>
                  </View>
                ) : monthlyReportData ? (
                  <View>
                    {/* Résumé */}
                    <View style={{ backgroundColor: '#e8f5e9', padding: 16, borderRadius: 10, marginBottom: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2E7D32', marginBottom: 8 }}>Résumé de la période</Text>
                      <Text style={{ color: '#333' }}>📦 Nombre de commandes: <Text style={{ fontWeight: 'bold' }}>{monthlyReportData.total_orders}</Text></Text>
                      <Text style={{ color: '#333' }}>🛒 Total produits commandés: <Text style={{ fontWeight: 'bold' }}>{monthlyReportData.total_products_ordered}</Text></Text>
                      <Text style={{ color: '#333' }}>💰 Montant total HT: <Text style={{ fontWeight: 'bold' }}>{monthlyReportData.total_amount?.toFixed(2) || '0.00'} €</Text></Text>
                    </View>
                    
                    {/* Affichage selon le mode */}
                    {monthlyReportData.view_mode === 'date' ? (
                      /* Mode par date */
                      monthlyReportData.dates && monthlyReportData.dates.length > 0 ? (
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor, marginBottom: 12 }}>📅 Détail par date</Text>
                          {monthlyReportData.dates.map((dateData: any, dateIdx: number) => (
                            <View key={dateIdx} style={{ marginBottom: 16 }}>
                              <View style={{ backgroundColor: primaryColor, padding: 10, borderRadius: 8 }}>
                                <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>
                                  {new Date(dateData.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </Text>
                              </View>
                              {dateData.orders.map((order: any, orderIdx: number) => (
                                <View key={orderIdx} style={{ marginLeft: 8, marginTop: 8 }}>
                                  <Text style={{ fontWeight: '600', color: '#555', marginBottom: 4 }}>
                                    {order.supplier_name} {order.order_type === 'consigne' ? '🍾' : order.order_type === 'reclamation' ? '⚠️' : '📦'}
                                  </Text>
                                  {order.items.map((item: any, itemIdx: number) => (
                                    <View 
                                      key={itemIdx}
                                      style={{ 
                                        flexDirection: 'row', 
                                        justifyContent: 'space-between', 
                                        padding: 8, 
                                        paddingLeft: 16,
                                        backgroundColor: itemIdx % 2 === 0 ? '#fff' : '#f9f9f9',
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#eee'
                                      }}
                                    >
                                      <Text style={{ flex: 1 }}>{item.product_name}</Text>
                                      <Text style={{ fontWeight: '500', color: primaryColor }}>{item.quantity} unités</Text>
                                    </View>
                                  ))}
                                </View>
                              ))}
                              <View style={{ backgroundColor: '#e3f2fd', padding: 10, marginTop: 4, borderRadius: 4 }}>
                                <Text style={{ fontWeight: '600', color: '#1565c0' }}>
                                  Sous-total: {dateData.total_items} produits - {dateData.total_amount?.toFixed(2) || '0.00'} €
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                          <Text style={{ color: '#666' }}>Aucune commande sur cette période</Text>
                        </View>
                      )
                    ) : (
                      /* Mode par produit (défaut) */
                      monthlyReportData.products && monthlyReportData.products.length > 0 ? (
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor, marginBottom: 12 }}>🛒 Détail par produit</Text>
                          {Object.entries(
                            monthlyReportData.products.reduce((acc: any, p: any) => {
                              if (!acc[p.supplier_name]) acc[p.supplier_name] = [];
                              acc[p.supplier_name].push(p);
                              return acc;
                            }, {})
                          ).map(([supplierName, prods]: [string, any]) => (
                            <View key={supplierName} style={{ marginBottom: 16 }}>
                              <View style={{ backgroundColor: primaryColor, padding: 10, borderRadius: 8 }}>
                                <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>{supplierName}</Text>
                              </View>
                              {prods.map((product: any, idx: number) => (
                                <View 
                                  key={idx} 
                                  style={{ 
                                    flexDirection: 'row', 
                                    justifyContent: 'space-between', 
                                    padding: 12, 
                                    backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9',
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#eee'
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: '500' }}>{product.product_name}</Text>
                                    <Text style={{ fontSize: 12, color: '#666' }}>
                                      {product.product_type === 'consigne' ? '🍾 Consigne' : product.product_type === 'reclamation' ? '⚠️ Réclamation' : '📦 Produit'}
                                    </Text>
                                  </View>
                                  <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontWeight: 'bold', color: primaryColor }}>{product.total_quantity} unités</Text>
                                    {product.total_amount > 0 && (
                                      <Text style={{ fontSize: 12, color: '#666' }}>{product.total_amount.toFixed(2)} €</Text>
                                    )}
                                  </View>
                                </View>
                              ))}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                          <Text style={{ color: '#666' }}>Aucune commande sur cette période</Text>
                        </View>
                      )
                    )}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <WebIcon name="document-text-outline" size={60} color="#ccc" />
                    <Text style={{ marginTop: 12, color: '#666', textAlign: 'center' }}>
                      Sélectionnez les filtres et cliquez sur "Générer" pour voir le rapport
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
        
        {/* Filtre Cuisine/Bar */}
        <View style={{ flexDirection: 'row', marginBottom: 16, gap: 8 }}>
          <TouchableOpacity 
            style={{ 
              flex: 1, 
              paddingVertical: 10, 
              borderRadius: 8, 
              alignItems: 'center',
              backgroundColor: categoryFilter === 'all' ? primaryColor : '#f0f0f0',
              borderWidth: 1,
              borderColor: primaryColor
            }}
            onPress={() => setCategoryFilter('all')}
            data-testid="filter-all"
          >
            <Text style={{ color: categoryFilter === 'all' ? secondaryColor : primaryColor, fontWeight: '600' }}>Tous</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ 
              flex: 1, 
              paddingVertical: 10, 
              borderRadius: 8, 
              alignItems: 'center',
              backgroundColor: categoryFilter === 'cuisine' ? '#e65100' : '#f0f0f0',
              borderWidth: 1,
              borderColor: '#e65100'
            }}
            onPress={() => setCategoryFilter('cuisine')}
            data-testid="filter-cuisine"
          >
            <Text style={{ color: categoryFilter === 'cuisine' ? '#fff' : '#e65100', fontWeight: '600' }}>🍳 Cuisine</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ 
              flex: 1, 
              paddingVertical: 10, 
              borderRadius: 8, 
              alignItems: 'center',
              backgroundColor: categoryFilter === 'bar' ? '#1565c0' : '#f0f0f0',
              borderWidth: 1,
              borderColor: '#1565c0'
            }}
            onPress={() => setCategoryFilter('bar')}
            data-testid="filter-bar"
          >
            <Text style={{ color: categoryFilter === 'bar' ? '#fff' : '#1565c0', fontWeight: '600' }}>🍺 Bar</Text>
          </TouchableOpacity>
        </View>
        
        {filteredSuppliers.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: '#666', fontSize: 16, marginBottom: 16 }}>
              {categoryFilter === 'all' ? 'Aucun fournisseur' : `Aucun fournisseur pour ${categoryFilter === 'cuisine' ? 'la cuisine' : 'le bar'}`}
            </Text>
            {canAddSupplier && (
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
                onPress={() => { resetSupplierForm(); setShowAddSupplier(true); }}
              >
                <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>+ Ajouter un fournisseur</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {filteredSuppliers.map((supplier: any) => (
              <TouchableOpacity 
                key={supplier.supplier_id}
                style={{ 
                  backgroundColor: '#fff', 
                  padding: 16, 
                  borderRadius: 10, 
                  marginBottom: 12,
                  borderLeftWidth: 4,
                  borderLeftColor: primaryColor,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                  elevation: 2
                }}
                onPress={() => selectSupplierForOrder(supplier)}
                data-testid={`supplier-${supplier.supplier_id}`}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>{supplier.name}</Text>
                    {supplier.phone && (
                      <Text style={{ fontSize: 13, color: '#666', marginTop: 4 }}>📞 {supplier.phone}</Text>
                    )}
                    {supplier.next_order_deadline && (
                      <View style={{ marginTop: 8, backgroundColor: '#fff3cd', padding: 8, borderRadius: 6 }}>
                        <Text style={{ fontSize: 12, color: '#856404' }}>⏰ Commander avant: {supplier.next_order_deadline}</Text>
                        <Text style={{ fontSize: 12, color: '#856404' }}>🚚 Livraison: {supplier.next_delivery}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {/* Bouton Calendrier Agenda */}
                    <TouchableOpacity 
                      onPress={(e) => openCalendar(supplier, e)} 
                      style={{ 
                        padding: 8, 
                        backgroundColor: '#e8f5e9', 
                        borderRadius: 6,
                        marginRight: 4
                      }}
                      data-testid={`supplier-calendar-${supplier.supplier_id}`}
                    >
                      <Text style={{ color: '#2e7d32', fontSize: 14 }}>📅</Text>
                    </TouchableOpacity>
                    {/* Bouton Historique */}
                    <TouchableOpacity 
                      onPress={(e) => { 
                        e.stopPropagation(); 
                        loadSupplierHistory(supplier); 
                      }} 
                      style={{ 
                        padding: 8, 
                        backgroundColor: '#e3f2fd', 
                        borderRadius: 6,
                        marginRight: 4
                      }}
                      data-testid={`supplier-history-${supplier.supplier_id}`}
                    >
                      <Text style={{ color: '#1976d2', fontSize: 14 }}>📋 Hist.</Text>
                    </TouchableOpacity>
                    {canEditSupplier && (
                      <TouchableOpacity 
                        onPress={(e) => { 
                          e.stopPropagation(); 
                          setSelectedSupplier(supplier); 
                          editSupplier(supplier); 
                        }} 
                        style={{ padding: 8 }}
                      >
                        <Text style={{ color: '#666' }}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            
            {canAddSupplier && (
              <TouchableOpacity 
                style={{ 
                  backgroundColor: primaryColor, 
                  paddingVertical: 14, 
                  borderRadius: 8, 
                  alignItems: 'center',
                  marginTop: 8
                }}
                onPress={() => { resetSupplierForm(); setShowAddSupplier(true); }}
              >
                <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 16 }}>+ Ajouter un fournisseur</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        
        {/* Modal Calendrier Agenda */}
        <Modal visible={showCalendarModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: '#fff', maxWidth: 400, width: '95%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>
                  📅 Calendrier - {calendarSupplier?.name}
                </Text>
                <TouchableOpacity onPress={() => setShowCalendarModal(false)}>
                  <Text style={{ fontSize: 24, color: primaryColor }}>✕</Text>
                </TouchableOpacity>
              </View>
              
              {calendarSupplier && (() => {
                const calendar = generateCalendarMonth(calendarMonthOffset);
                return (
                  <View style={{ padding: 16 }}>
                    {/* Titre du mois avec flèches de navigation */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <TouchableOpacity 
                        onPress={() => setCalendarMonthOffset(calendarMonthOffset - 1)}
                        style={{ padding: 8, backgroundColor: '#f0f0f0', borderRadius: 20 }}
                      >
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>◀</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center', color: primaryColor }}>
                        {calendar.monthName} {calendar.year}
                      </Text>
                      <TouchableOpacity 
                        onPress={() => setCalendarMonthOffset(calendarMonthOffset + 1)}
                        style={{ padding: 8, backgroundColor: '#f0f0f0', borderRadius: 20 }}
                      >
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>▶</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {/* Légende */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#4CAF50' }} />
                        <Text style={{ fontSize: 12, color: '#666' }}>Livraison</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF9800' }} />
                        <Text style={{ fontSize: 12, color: '#666' }}>Commande</Text>
                      </View>
                    </View>
                    
                    {/* En-têtes des jours */}
                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                      {dayNames.map((day, idx) => (
                        <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#666' }}>{day}</Text>
                        </View>
                      ))}
                    </View>
                    
                    {/* Grille du calendrier */}
                    {calendar.weeks.map((week, weekIdx) => (
                      <View key={weekIdx} style={{ flexDirection: 'row', marginBottom: 4 }}>
                        {week.map((day, dayIdx) => {
                          const dayType = day ? getDayType(day, calendarSupplier, calendar.year, calendar.month) : null;
                          const today = new Date();
                          const isToday = day === today.getDate() && calendar.month === today.getMonth() && calendar.year === today.getFullYear();
                          
                          let bgColor = 'transparent';
                          let borderColor = 'transparent';
                          let textColor = day ? '#333' : '#ccc';
                          
                          if (dayType === 'delivery') {
                            bgColor = '#E8F5E9';
                            borderColor = '#4CAF50';
                          } else if (dayType === 'order') {
                            bgColor = '#FFF3E0';
                            borderColor = '#FF9800';
                          } else if (dayType === 'both') {
                            bgColor = '#E3F2FD';
                            borderColor = '#2196F3';
                          }
                          
                          return (
                            <View 
                              key={dayIdx} 
                              style={{ 
                                flex: 1, 
                                alignItems: 'center', 
                                paddingVertical: 8,
                                backgroundColor: bgColor,
                                borderWidth: dayType ? 2 : (isToday ? 1 : 0),
                                borderColor: dayType ? borderColor : (isToday ? primaryColor : 'transparent'),
                                borderRadius: 6,
                                marginHorizontal: 1
                              }}
                            >
                              <Text style={{ 
                                fontSize: 14, 
                                fontWeight: isToday ? 'bold' : 'normal',
                                color: textColor
                              }}>
                                {day || ''}
                              </Text>
                              {dayType && (
                                <Text style={{ fontSize: 8, marginTop: 2 }}>
                                  {dayType === 'delivery' ? '🚚' : dayType === 'order' ? '📝' : '🚚📝'}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ))}
                    
                    {/* Info sur les jours configurés */}
                    <View style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                        <Text style={{ fontWeight: 'bold' }}>Jours de livraison: </Text>
                        {calendarSupplier.delivery_schedule?.delivery_days?.length > 0 
                          ? calendarSupplier.delivery_schedule.delivery_days.map((d: number) => fullDayNames[d]).join(', ')
                          : 'Non configuré'}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        <Text style={{ fontWeight: 'bold' }}>Jours de commande: </Text>
                        {calendarSupplier.delivery_schedule?.order_deadline_days?.length > 0 
                          ? calendarSupplier.delivery_schedule.order_deadline_days.map((d: number) => fullDayNames[d]).join(', ')
                          : 'Non configuré'}
                      </Text>
                    </View>
                    
                    <TouchableOpacity 
                      onPress={() => setShowCalendarModal(false)}
                      style={{ 
                        backgroundColor: primaryColor, 
                        padding: 12, 
                        borderRadius: 8, 
                        marginTop: 16,
                        alignItems: 'center'
                      }}
                    >
                      <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>Fermer</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          </View>
        </Modal>
        
        {/* Modal Ajouter Fournisseur */}
        <Modal visible={showAddSupplier} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 500, width: '95%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Nouveau fournisseur</Text>
                <TouchableOpacity onPress={() => setShowAddSupplier(false)}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 500 }}>
                <View style={styles.modalBody}>
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4 }}>Nom du fournisseur *</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: Metro, Transgourmet..." 
                    value={supplierName} 
                    onChangeText={setSupplierName}
                  />
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4, marginTop: 12 }}>Téléphone (commercial)</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: 01 23 45 67 89" 
                    value={supplierPhone} 
                    onChangeText={setSupplierPhone}
                    keyboardType="phone-pad"
                  />
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>Catégorie</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[
                      { value: 'bar', label: 'Bar' },
                      { value: 'cuisine', label: 'Cuisine' },
                      { value: 'both', label: 'Bar et Cuisine' }
                    ].map((cat) => (
                      <TouchableOpacity 
                        key={cat.value}
                        style={{ 
                          paddingHorizontal: 16, 
                          paddingVertical: 10, 
                          borderRadius: 8,
                          backgroundColor: supplierCategory === cat.value ? primaryColor : '#e0e0e0',
                          borderWidth: 1,
                          borderColor: supplierCategory === cat.value ? primaryColor : '#ccc'
                        }}
                        onPress={() => setSupplierCategory(supplierCategory === cat.value ? '' : cat.value as any)}
                      >
                        <Text style={{ color: supplierCategory === cat.value ? secondaryColor : '#333', fontWeight: supplierCategory === cat.value ? 'bold' : 'normal' }}>{cat.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>Jours de livraison</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {dayNames.map((day, index) => (
                      <TouchableOpacity 
                        key={index}
                        style={{ 
                          paddingHorizontal: 12, 
                          paddingVertical: 8, 
                          borderRadius: 6,
                          backgroundColor: deliveryDays.includes(index) ? primaryColor : '#e0e0e0'
                        }}
                        onPress={() => toggleDeliveryDay(index)}
                      >
                        <Text style={{ color: deliveryDays.includes(index) ? secondaryColor : '#333' }}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>Jours limites de commande</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {dayNames.map((day, index) => (
                      <TouchableOpacity 
                        key={index}
                        style={{ 
                          paddingHorizontal: 12, 
                          paddingVertical: 8, 
                          borderRadius: 6,
                          backgroundColor: orderDeadlineDays.includes(index) ? primaryColor : '#e0e0e0'
                        }}
                        onPress={() => toggleOrderDeadlineDay(index)}
                      >
                        <Text style={{ color: orderDeadlineDays.includes(index) ? secondaryColor : '#333' }}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4, marginTop: 16 }}>Heure limite de commande</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: 19:00" 
                    value={orderDeadlineTime} 
                    onChangeText={setOrderDeadlineTime}
                  />
                  
                  <TouchableOpacity 
                    style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 20 }]} 
                    onPress={createSupplier}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={secondaryColor} />
                    ) : (
                      <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Créer le fournisseur</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
        
        {/* Modal Modifier Fournisseur */}
        <Modal visible={showEditSupplier} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 500, width: '95%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>Modifier le fournisseur</Text>
                <TouchableOpacity onPress={() => setShowEditSupplier(false)}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 600 }}>
                <View style={styles.modalBody}>
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4 }}>Nom du fournisseur *</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: Metro, Transgourmet..." 
                    value={supplierName} 
                    onChangeText={setSupplierName}
                  />
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4, marginTop: 12 }}>Téléphone (commercial)</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: 01 23 45 67 89" 
                    value={supplierPhone} 
                    onChangeText={setSupplierPhone}
                    keyboardType="phone-pad"
                  />
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>Catégorie</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[
                      { value: 'bar', label: 'Bar' },
                      { value: 'cuisine', label: 'Cuisine' },
                      { value: 'both', label: 'Bar et Cuisine' }
                    ].map((cat) => (
                      <TouchableOpacity 
                        key={cat.value}
                        style={{ 
                          paddingHorizontal: 16, 
                          paddingVertical: 10, 
                          borderRadius: 8,
                          backgroundColor: supplierCategory === cat.value ? primaryColor : '#e0e0e0',
                          borderWidth: 1,
                          borderColor: supplierCategory === cat.value ? primaryColor : '#ccc'
                        }}
                        onPress={() => setSupplierCategory(supplierCategory === cat.value ? '' : cat.value as any)}
                      >
                        <Text style={{ color: supplierCategory === cat.value ? secondaryColor : '#333', fontWeight: supplierCategory === cat.value ? 'bold' : 'normal' }}>{cat.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>Jours de livraison</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {dayNames.map((day, index) => (
                      <TouchableOpacity 
                        key={index}
                        style={{ 
                          paddingHorizontal: 12, 
                          paddingVertical: 8, 
                          borderRadius: 6,
                          backgroundColor: deliveryDays.includes(index) ? primaryColor : '#e0e0e0'
                        }}
                        onPress={() => toggleDeliveryDay(index)}
                      >
                        <Text style={{ color: deliveryDays.includes(index) ? secondaryColor : '#333' }}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8, marginTop: 16 }}>Jours limites de commande</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {dayNames.map((day, index) => (
                      <TouchableOpacity 
                        key={index}
                        style={{ 
                          paddingHorizontal: 12, 
                          paddingVertical: 8, 
                          borderRadius: 6,
                          backgroundColor: orderDeadlineDays.includes(index) ? primaryColor : '#e0e0e0'
                        }}
                        onPress={() => toggleOrderDeadlineDay(index)}
                      >
                        <Text style={{ color: orderDeadlineDays.includes(index) ? secondaryColor : '#333' }}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4, marginTop: 16 }}>Heure limite de commande</Text>
                  <TextInput 
                    style={[styles.modalInput, { borderColor: primaryColor }]} 
                    placeholder="Ex: 19:00" 
                    value={orderDeadlineTime} 
                    onChangeText={setOrderDeadlineTime}
                  />
                  
                  <TouchableOpacity 
                    style={[styles.modalSubmitButton, { backgroundColor: primaryColor, marginTop: 20 }]} 
                    onPress={updateSupplier}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={secondaryColor} />
                    ) : (
                      <Text style={[styles.modalSubmitButtonText, { color: secondaryColor }]}>Enregistrer</Text>
                    )}
                  </TouchableOpacity>
                  
                  {canDeleteSupplier && (
                    <TouchableOpacity 
                      style={{ marginTop: 16, padding: 12, alignItems: 'center' }}
                      onPress={() => deleteSupplier(selectedSupplier?.supplier_id)}
                    >
                      <Text style={{ color: '#dc3545', fontWeight: 'bold' }}>Supprimer ce fournisseur</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }
  
  // Vue de création de commande
  if (currentView === 'order' && selectedSupplier) {
    const hasSelectedProducts = Object.keys(selectedProducts).length > 0;
    
    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {/* Header avec retour */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setCurrentView('suppliers')} style={{ marginRight: 12 }}>
              <WebIcon name="arrow-back" size={24} color={primaryColor} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>{selectedSupplier.name}</Text>
              {selectedSupplier.phone && (
                <Text style={{ fontSize: 13, color: '#666' }}>📞 {selectedSupplier.phone}</Text>
              )}
            </View>
          </View>
          
          {/* Infos de livraison */}
          {selectedSupplier.next_order_deadline && (
            <View style={{ backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#856404', fontWeight: 'bold' }}>
                ⏰ Commander avant: {selectedSupplier.next_order_deadline}
              </Text>
              <Text style={{ fontSize: 14, color: '#856404', marginTop: 4 }}>
                🚚 Livraison: {selectedSupplier.next_delivery}
              </Text>
            </View>
          )}
          
          {/* Header Produits */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor }}>📦 Produits</Text>
            {canAddProduct && (
              <TouchableOpacity 
                onPress={() => { setProductType('product'); setShowAddProduct(true); }}
                style={{ backgroundColor: primaryColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
              >
                <Text style={{ color: secondaryColor, fontSize: 13 }}>+ Ajouter</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {productsList.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, marginBottom: 16 }}>
              <Text style={{ color: '#666' }}>Aucun produit</Text>
            </View>
          ) : (
            productsList.map((product: any) => {
              const isSelected = selectedProducts[product.product_id] !== undefined;
              const quantity = selectedProducts[product.product_id] || 0;
              
              return (
                <View 
                  key={product.product_id}
                  style={{ 
                    backgroundColor: isSelected ? '#e8f5e9' : '#fff',
                    padding: 12, 
                    borderRadius: 8, 
                    marginBottom: 8,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? '#4caf50' : '#ddd',
                    flexDirection: 'row',
                    alignItems: 'center'
                  }}
                >
                  <TouchableOpacity 
                    onPress={() => toggleProductSelection(product.product_id)}
                    style={{ marginRight: 12 }}
                  >
                    <View style={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: 4, 
                      borderWidth: 2,
                      borderColor: isSelected ? '#4caf50' : '#999',
                      backgroundColor: isSelected ? '#4caf50' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {isSelected && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: '#333' }}>{product.name}</Text>
                    {product.price_ht > 0 && (
                      <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        Prix: {product.price_ht.toFixed(2)}€ HT
                      </Text>
                    )}
                  </View>
                  
                  {isSelected && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity 
                        onPress={() => updateQuantity(product.product_id, -1)}
                        style={{ 
                          width: 32, 
                          height: 32, 
                          backgroundColor: primaryColor, 
                          borderRadius: 16, 
                          alignItems: 'center', 
                          justifyContent: 'center' 
                        }}
                      >
                        <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>-</Text>
                      </TouchableOpacity>
                      <Text style={{ 
                        marginHorizontal: 12, 
                        fontSize: 18, 
                        fontWeight: 'bold', 
                        minWidth: 30, 
                        textAlign: 'center' 
                      }}>{quantity}</Text>
                      <TouchableOpacity 
                        onPress={() => updateQuantity(product.product_id, 1)}
                        style={{ 
                          width: 32, 
                          height: 32, 
                          backgroundColor: primaryColor, 
                          borderRadius: 16, 
                          alignItems: 'center', 
                          justifyContent: 'center' 
                        }}
                      >
                        <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  {canDeleteProduct && !isSelected && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => openEditProduct(product)} style={{ padding: 8 }}>
                        <Text style={{ color: '#ffc107', fontSize: 16 }}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteProduct(product.product_id)} style={{ padding: 8 }}>
                        <Text style={{ color: '#dc3545' }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
          
          {/* Section Consignes */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor }}>🍾 Consignes</Text>
            {canAddConsigne && (
              <TouchableOpacity 
                onPress={() => { setProductType('consigne'); setShowAddProduct(true); }}
                style={{ backgroundColor: '#6c757d', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
              >
                <Text style={{ color: '#fff', fontSize: 13 }}>+ Ajouter</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {consignesList.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 16 }}>
              <Text style={{ color: '#666' }}>Aucune consigne</Text>
              <Text style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Ex: bouteilles vides, casiers, etc.</Text>
            </View>
          ) : (
            <>
              {consignesList.map((product: any) => {
                const isSelected = selectedProducts[product.product_id] !== undefined;
                const quantity = selectedProducts[product.product_id] || 0;
                const priceHT = product.price_ht || 0;
                const lineTotal = quantity * priceHT;
                
                return (
                  <View 
                    key={product.product_id}
                    style={{ 
                      backgroundColor: isSelected ? '#e3f2fd' : '#f8f9fa',
                      padding: 12, 
                      borderRadius: 8, 
                      marginBottom: 8,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? '#2196f3' : '#ddd'
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity 
                        onPress={() => toggleProductSelection(product.product_id)}
                        style={{ marginRight: 12 }}
                      >
                        <View style={{ 
                          width: 24, 
                          height: 24, 
                          borderRadius: 4, 
                          borderWidth: 2,
                          borderColor: isSelected ? '#2196f3' : '#999',
                          backgroundColor: isSelected ? '#2196f3' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {isSelected && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
                        </View>
                      </TouchableOpacity>
                      
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, color: '#333' }}>{product.name}</Text>
                        {priceHT > 0 && (
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                            Prix unitaire: {priceHT.toFixed(2)}€ HT
                          </Text>
                        )}
                      </View>
                      
                      {canDeleteProduct && !isSelected && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity onPress={() => openEditProduct(product)} style={{ padding: 8 }}>
                            <Text style={{ color: '#ffc107', fontSize: 16 }}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => deleteProduct(product.product_id)}
                            style={{ padding: 8 }}
                          >
                            <Text style={{ color: '#f44336', fontSize: 16 }}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    
                    {isSelected && (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ddd' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity 
                              onPress={() => updateQuantity(product.product_id, -1)}
                              style={{ 
                                width: 32, 
                                height: 32, 
                                backgroundColor: '#6c757d', 
                                borderRadius: 16, 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>-</Text>
                            </TouchableOpacity>
                            <Text style={{ 
                              marginHorizontal: 12, 
                              fontSize: 18, 
                              fontWeight: 'bold', 
                              minWidth: 30, 
                              textAlign: 'center' 
                            }}>{quantity}</Text>
                            <TouchableOpacity 
                              onPress={() => updateQuantity(product.product_id, 1)}
                              style={{ 
                                width: 32, 
                                height: 32, 
                                backgroundColor: '#6c757d', 
                                borderRadius: 16, 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>+</Text>
                            </TouchableOpacity>
                          </View>
                          
                          {priceHT > 0 && quantity > 0 && (
                            <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#1976d2' }}>
                              Total: {lineTotal.toFixed(2)}€ HT
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
              
              {/* Total HT des consignes sélectionnées */}
              {(() => {
                const totalConsignesHT = consignesList.reduce((sum: number, product: any) => {
                  const qty = selectedProducts[product.product_id] || 0;
                  const price = product.price_ht || 0;
                  return sum + (qty * price);
                }, 0);
                
                const hasSelectedConsignes = Object.keys(selectedProducts).some(pid => 
                  consignesList.some((p: any) => p.product_id === pid && selectedProducts[pid] > 0)
                );
                
                if (hasSelectedConsignes && totalConsignesHT > 0) {
                  return (
                    <View style={{ 
                      backgroundColor: '#e8f5e9', 
                      padding: 12, 
                      borderRadius: 8, 
                      marginTop: 8,
                      borderWidth: 2,
                      borderColor: '#4caf50',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#2e7d32' }}>
                        💰 Total consignes à rembourser:
                      </Text>
                      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>
                        {totalConsignesHT.toFixed(2)}€ HT
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}
            </>
          )}
          
          {/* Section Réclamations - Produits non reçus */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#d32f2f' }}>⚠️ Réclamations</Text>
            {currentReclamations.length > 0 && (
              <Text style={{ fontSize: 12, color: '#666' }}>
                {currentReclamations.length} article{currentReclamations.length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
          
          <View style={{ backgroundColor: '#ffebee', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: '#666', fontSize: 12, marginBottom: 12 }}>Produits non reçus ou problèmes de livraison pour {selectedSupplier?.name}</Text>
            
            {/* Liste des réclamations */}
            {currentReclamations.map((item, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#ffcdd2' }}>
                <Text style={{ flex: 2, color: '#333' }}>{item.name}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: '#666' }}>x{item.quantity}</Text>
                <Text style={{ flex: 1, textAlign: 'right', color: '#d32f2f', fontWeight: 'bold' }}>{item.price.toFixed(2)}€ HT</Text>
                <TouchableOpacity 
                  onPress={() => removeReclamation(idx)}
                  style={{ marginLeft: 8, padding: 4 }}
                >
                  <Text style={{ color: '#d32f2f' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            
            {/* Formulaire ajout réclamation - responsive */}
            <View style={{ marginTop: 8, width: '100%' }}>
              <TextInput
                placeholder="Nom du produit"
                value={newReclamationName}
                onChangeText={setNewReclamationName}
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ddd', marginBottom: 8 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: '30%', marginRight: 8 }}>
                  <TextInput
                    placeholder="Qté"
                    value={newReclamationQty}
                    onChangeText={setNewReclamationQty}
                    keyboardType="numeric"
                    style={{ backgroundColor: '#fff', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ddd', textAlign: 'center' }}
                  />
                </View>
                <View style={{ width: '68%' }}>
                  <TextInput
                    placeholder="Prix HT (€)"
                    value={newReclamationPrice}
                    onChangeText={setNewReclamationPrice}
                    keyboardType="decimal-pad"
                    style={{ backgroundColor: '#fff', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ddd', textAlign: 'center' }}
                  />
                </View>
              </View>
              <Pressable 
                onPress={addReclamation}
                style={({ pressed }) => ({ 
                  backgroundColor: pressed ? '#b71c1c' : '#d32f2f', 
                  padding: 14, 
                  borderRadius: 6, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginTop: 8 
                })}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>+ Ajouter la réclamation</Text>
              </Pressable>
            </View>
            
            {/* Total HT et bouton Envoyer */}
            {currentReclamations.length > 0 && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ffcdd2' }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#d32f2f', marginBottom: 12 }}>
                  Total HT: {currentReclamations.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}€
                </Text>
                <Pressable
                  onPress={() => {
                    console.log('Envoi réclamation clicked');
                    sendReclamation();
                  }}
                  style={({ pressed }) => ({ 
                    backgroundColor: pressed ? '#b71c1c' : '#d32f2f', 
                    padding: 16, 
                    borderRadius: 8,
                    alignItems: 'center',
                    minHeight: 50
                  })}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                    📤 Envoyer la réclamation
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
        
        {/* Bouton Envoyer la commande */}
        {hasSelectedProducts && (
          <View style={{ padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd' }}>
            <TouchableOpacity 
              style={{ 
                backgroundColor: '#4caf50', 
                paddingVertical: 16, 
                borderRadius: 8, 
                alignItems: 'center' 
              }}
              onPress={createOrder}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                  📤 Envoyer la commande ({Object.keys(selectedProducts).length} produit(s))
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        
        {/* Modal Ajouter/Modifier Produit */}
        <Modal visible={showAddProduct} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: secondaryColor, maxWidth: 400, width: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: primaryColor }]}>
                  {editingProduct 
                    ? (productType === 'consigne' ? '🍾 Modifier la consigne' : '📦 Modifier le produit')
                    : (productType === 'consigne' ? '🍾 Nouvelle consigne' : '📦 Nouveau produit')
                  }
                </Text>
                <TouchableOpacity onPress={() => { setShowAddProduct(false); setProductType('product'); setEditingProduct(null); setProductPriceHT(''); }}>
                  <WebIcon name="close" size={28} color={primaryColor} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                {/* Sélecteur de type - caché en mode édition */}
                {!editingProduct && (
                  <>
                    <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 8 }}>Type</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                      <TouchableOpacity 
                        style={{ 
                          flex: 1, 
                          paddingVertical: 12, 
                          borderRadius: 8, 
                          alignItems: 'center',
                          backgroundColor: productType === 'product' ? primaryColor : '#e0e0e0',
                          borderWidth: 2,
                          borderColor: productType === 'product' ? primaryColor : '#ccc'
                        }}
                        onPress={() => setProductType('product')}
                      >
                        <Text style={{ 
                          fontWeight: 'bold', 
                          color: productType === 'product' ? secondaryColor : '#333' 
                        }}>
                          📦 Produit
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={{ 
                          flex: 1, 
                          paddingVertical: 12, 
                          borderRadius: 8, 
                          alignItems: 'center',
                          backgroundColor: productType === 'consigne' ? '#6c757d' : '#e0e0e0',
                          borderWidth: 2,
                          borderColor: productType === 'consigne' ? '#6c757d' : '#ccc'
                        }}
                        onPress={() => setProductType('consigne')}
                      >
                        <Text style={{ 
                          fontWeight: 'bold', 
                          color: productType === 'consigne' ? '#fff' : '#333' 
                        }}>
                          🍾 Consigne
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
                
                <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4 }}>
                  {productType === 'consigne' ? 'Nom de la consigne *' : 'Nom du produit *'}
                </Text>
                <TextInput 
                  style={[styles.modalInput, { borderColor: primaryColor }]} 
                  placeholder={productType === 'consigne' ? 'Ex: Bouteilles vides, Casiers...' : 'Ex: Tomates cerises, Beurre doux...'} 
                  value={productName} 
                  onChangeText={setProductName}
                />
                
                {/* Champ prix pour les consignes */}
                {productType === 'consigne' && (
                  <>
                    <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4, marginTop: 12 }}>
                      Prix HT (€) - Valeur du remboursement
                    </Text>
                    <TextInput 
                      style={[styles.modalInput, { borderColor: primaryColor }]} 
                      placeholder="Ex: 5.50" 
                      value={consignePriceHT} 
                      onChangeText={setConsignePriceHT}
                      keyboardType="decimal-pad"
                    />
                    <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                      Ce prix sera utilisé pour calculer le total à rembourser
                    </Text>
                  </>
                )}
                
                {/* Champ prix optionnel pour les produits */}
                {productType === 'product' && (
                  <>
                    <Text style={{ color: primaryColor, fontWeight: 'bold', marginBottom: 4, marginTop: 12 }}>
                      Prix HT (€) - Optionnel
                    </Text>
                    <TextInput 
                      style={[styles.modalInput, { borderColor: primaryColor }]} 
                      placeholder="Ex: 2.50 (laisser vide si non applicable)" 
                      value={productPriceHT} 
                      onChangeText={setProductPriceHT}
                      keyboardType="decimal-pad"
                    />
                    <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                      Ce prix sera utilisé pour le calcul du rapport (optionnel)
                    </Text>
                  </>
                )}
                
                <TouchableOpacity 
                  style={[styles.modalSubmitButton, { backgroundColor: productType === 'consigne' ? '#6c757d' : primaryColor, marginTop: 16 }]} 
                  onPress={createProduct}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={productType === 'consigne' ? '#fff' : secondaryColor} />
                  ) : (
                    <Text style={[styles.modalSubmitButtonText, { color: productType === 'consigne' ? '#fff' : secondaryColor }]}>
                      {editingProduct 
                        ? (productType === 'consigne' ? 'Modifier la consigne' : 'Modifier le produit')
                        : (productType === 'consigne' ? 'Ajouter la consigne' : 'Ajouter le produit')
                      }
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        
        {/* Modal PDF Commande/Consigne */}
        <Modal visible={showOrderPdfModal} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Header avec boutons Retour et Télécharger */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: primaryColor, paddingTop: 50 }}>
              <TouchableOpacity 
                onPress={() => {
                  setShowOrderPdfModal(false);
                  setOrderPdfUrl('');
                  setOrderPdfTitle('');
                }}
                style={{ backgroundColor: '#444', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontSize: 16, marginRight: 6 }}>←</Text>
                <Text style={{ color: 'white', fontWeight: '600' }}>Retour</Text>
              </TouchableOpacity>
              <Text style={{ color: secondaryColor, fontSize: 14, fontWeight: 'bold', flex: 1, textAlign: 'center', marginHorizontal: 8 }} numberOfLines={1}>
                {orderPdfTitle}
              </Text>
              <TouchableOpacity 
                onPress={downloadOrderPdfFile}
                style={{ backgroundColor: '#27ae60', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
              >
                <WebIcon name="download-outline" size={18} color="white" />
                <Text style={{ color: 'white', fontWeight: '600', marginLeft: 6 }}>Télécharger</Text>
              </TouchableOpacity>
            </View>
            {/* Zone PDF */}
            <View style={{ flex: 1, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
              {orderPdfUrl ? (
                <View style={{ width: '100%', height: '100%' }}>
                  <iframe
                    src={orderPdfUrl + '#toolbar=0'}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title={orderPdfTitle}
                  />
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <Text style={{ marginTop: 16, color: '#666' }}>Chargement...</Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }
  
  // Vue historique des commandes
  if (currentView === 'history') {
    return (
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setCurrentView('suppliers')} style={{ marginRight: 12 }}>
              <WebIcon name="arrow-back" size={24} color={primaryColor} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>Historique des commandes</Text>
          </View>
        </View>
        
        {orders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: '#666' }}>Aucune commande</Text>
          </View>
        ) : (
          orders.map((order: any) => (
            <View 
              key={order.order_id}
              style={{ 
                backgroundColor: '#fff', 
                padding: 16, 
                borderRadius: 10, 
                marginBottom: 12,
                borderLeftWidth: 4,
                borderLeftColor: order.status === 'ordered' ? '#ffc107' : order.status === 'delivered' ? '#4caf50' : '#dc3545'
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor }}>{order.supplier_name}</Text>
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                    {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#666' }}>Par: {order.created_by_name}</Text>
                </View>
                
                {/* Bouton Supprimer (icône uniquement) + Statut */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity 
                    onPress={async () => {
                      if (await showConfirm('Voulez-vous vraiment supprimer cette commande ?')) {
                        try {
                          await apiRequest(`/supplier-orders/${order.order_id}`, { method: 'DELETE' });
                          loadOrders();
                          showAlert('Succès', 'Commande supprimée');
                        } catch (error) {
                          showAlert('Erreur', 'Impossible de supprimer la commande');
                        }
                      }
                    }}
                    style={{ backgroundColor: '#dc3545', padding: 6, borderRadius: 6 }}
                    data-testid={`delete-order-${order.order_id}`}
                  >
                    <WebIcon name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                  
                  <View style={{ 
                    paddingHorizontal: 10, 
                    paddingVertical: 4, 
                    borderRadius: 12,
                    backgroundColor: 
                      order.status === 'to_order' ? '#fff3e0' :
                      order.status === 'ordered' ? '#fff3cd' : 
                      order.status === 'delivered' ? '#d4edda' : 
                      order.status === 'sent' ? '#fff3e0' :
                      order.status === 'to_request' ? '#fff3e0' :
                      order.status === 'requested' ? '#e3f2fd' :
                      order.status === 'partial_refund' ? '#f3e5f5' :
                      order.status === 'full_refund' ? '#e8f5e9' :
                      '#f8d7da'
                  }}>
                    <Text style={{ 
                      fontSize: 11, 
                      fontWeight: 'bold',
                      color: 
                        order.status === 'to_order' ? '#e65100' :
                        order.status === 'ordered' ? '#856404' : 
                        order.status === 'delivered' ? '#155724' : 
                        order.status === 'sent' ? '#e65100' :
                        order.status === 'to_request' ? '#e65100' :
                        order.status === 'requested' ? '#1565c0' :
                        order.status === 'partial_refund' ? '#7b1fa2' :
                        order.status === 'full_refund' ? '#2e7d32' :
                        '#721c24'
                    }}>
                      {order.status === 'to_order' ? 'À commander' :
                       order.status === 'ordered' ? 'Commandé' : 
                       order.status === 'delivered' ? 'Livré' : 
                       order.status === 'sent' ? 'Envoyé' :
                       order.status === 'to_request' ? 'À demander' :
                       order.status === 'requested' ? 'Demandé' :
                       order.status === 'partial_refund' ? 'Remboursé partiel' :
                       order.status === 'full_refund' ? 'Remboursé' :
                       order.status}
                    </Text>
                  </View>
                </View>
              </View>
              
              {/* Liste des produits */}
              <View style={{ marginTop: 12, backgroundColor: '#f8f9fa', padding: 10, borderRadius: 6 }}>
                {order.items.map((item: any, index: number) => (
                  <Text key={index} style={{ fontSize: 13, color: '#333' }}>
                    • {item.product_name}: <Text style={{ fontWeight: 'bold' }}>{item.quantity}</Text>
                  </Text>
                ))}
              </View>
              
              {/* Actions (PDF, WhatsApp, Email, SMS sur une ligne) */}
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity 
                  onPress={() => downloadOrderPDF(order.order_id, `${order.order_type === 'consigne' ? 'Consigne' : order.order_type === 'reclamation' ? 'Réclamation' : 'Commande'} - ${order.supplier_name}`)}
                  style={{ backgroundColor: primaryColor, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                >
                  <Text style={{ color: secondaryColor, fontSize: 12 }}>📄 PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => shareOrder(order.order_id, 'whatsapp')}
                  style={{ backgroundColor: '#25d366', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => shareOrder(order.order_id, 'email')}
                  style={{ backgroundColor: '#0077b5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>✉️ Email</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => shareOrder(order.order_id, 'sms')}
                  style={{ backgroundColor: '#6c757d', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>SMS</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  }
  
  return null;
}

// ==================== HELPER FUNCTIONS ====================
function getTodayDate(): string { return new Date().toISOString().split('T')[0]; }
function getTomorrowDate(): string { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function addDays(dateStr: string, days: number): string { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; }
function formatDate(dateStr: string): string { return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }

// ==================== EVENTS SCREEN ====================

interface EventsScreenProps {
  events: any[];
  selectedEvent: any | null;
  setSelectedEvent: (event: any | null) => void;
  providers: any[];
  tasks: any[];
  menuSections: any[];
  menuItems: any[];
  pricePackages: any[];
  drinkOptions: any[];
  users: any[];
  prestataires: Prestataire[];
  primaryColor: string;
  secondaryColor: string;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  loadEvents: () => void;
  loadEventData: (eventId: string) => void;
  loadPrestataires: () => void;
  allRestaurants: any[];
  restaurant: any;
  setShowRestaurantPicker: (show: boolean) => void;
  isAdmin: boolean;
  userPermissions: any;
}

function EventsScreen(_props: any) { return null as any; }

// ==================== FACTURATION SCREEN (Devis et Factures) ====================
function FacturationScreen(_props: any) { return null as any; }

// ==================== RAPPORT ARDOISE SCREEN ====================
function RapportArdoiseScreen(_props: any) { return null as any; }

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
