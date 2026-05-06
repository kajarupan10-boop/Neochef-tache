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

const DEFAULT_PRIMARY = '#26252D';
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
  const [currentScreen, setCurrentScreen] = useState<'daily' | 'templates' | 'prepare' | 'categories' | 'users' | 'settings' | 'history' | 'menuGroupe' | 'createGroup' | 'permanentTasks' | 'orderPrep' | 'ficheTechnique' | 'menuRestaurant' | 'events' | 'facturation' | 'rapportArdoise' | 'prestataires' | 'superadmin'>('events');
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
              {/* [APP-FILTER] History settings masqué */}
              <TouchableOpacity 
                style={styles.settingsDropdownItem} 
                onPress={() => { setShowSettingsDropdown(false); setCurrentScreen('prestataires'); loadPrestataires(); }}
              >
                <WebIcon name="construct-outline" size={20} color={secondaryColor} />
                <Text style={[styles.settingsDropdownText, { color: secondaryColor }]}>Prestataires</Text>
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
          {/* Option Tâches - visible pour admins et staff avec permission tâches */}
          {/* [APP-FILTER] menu-item-tasks masqué */}
          {/* Option Préparation de Commande - visible pour admins et staff avec permission */}
          {/* [APP-FILTER] menu-item-order-prep masqué */}
          {/* Option Menu Restaurant - visible pour admins et staff avec permission menu_restaurant */}
          {/* [APP-FILTER] menu-item-menu-restaurant masqué */}
          {/* Option Menu Restaurant en cours (brouillon) - visible pour admins et staff avec permission menu_restaurant_en_cours */}
          {/* [APP-FILTER] menu-item-menu-restaurant-draft masqué */}
          {/* Option Menu Client - visible pour admins et staff avec permission menu_client ou menu_restaurant */}
          {/* [APP-FILTER] menu-item-menu-client masqué */}
          {/* Option Fiche Technique - visible pour admins et staff avec permission fiche_technique */}
          {/* [APP-FILTER] menu-item-fiche-technique masqué */}
          {/* Option Menu Groupe - visible pour admins et staff avec permission menu_groupe */}
          {hasMenuGroupeAccess() && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('menuGroupe'); loadMenuSections(); loadMenuItems(); loadGroupReservations(); }}
              data-testid="menu-item-groupe"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>🍴</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Menu Groupe</Text>
            </TouchableOpacity>
          )}
          {/* Option Événement - visible pour admins et staff avec permission événements */}
          {(user.role === 'admin' || hasEventsAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('events'); loadEvents(); loadPrestataires(); }}
              data-testid="menu-item-events"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>🎉</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Événement</Text>
            </TouchableOpacity>
          )}
          {/* Option Facturation - visible pour admins et staff avec permission facturation */}
          {(user.role === 'admin' || hasFacturationAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('facturation'); loadInvoices(); }}
              data-testid="menu-item-facturation"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>📄</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Facturation</Text>
            </TouchableOpacity>
          )}
          {/* Option Rapport Ardoise - visible pour admins et staff avec permission ardoise */}
          {/* [APP-FILTER] menu-item-rapport-ardoise masqué */}
          {/* Option Prestataires - visible pour admins et staff avec permission prestataires */}
          {(user.role === 'admin' || hasPrestatairesAccess()) && (
            <TouchableOpacity 
              style={styles.managerMenuItem} 
              onPress={() => { setShowManagerMenu(false); setCurrentScreen('prestataires'); loadPrestataires(); }}
              data-testid="menu-item-prestataires"
            >
              <Text style={{ color: secondaryColor, fontSize: 18, width: 28 }}>🤝</Text>
              <Text style={[styles.managerMenuText, { color: secondaryColor }]}>Prestataires</Text>
            </TouchableOpacity>
          )}
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
      {false && !isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && (
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
function DailyTasksScreen(_props: any) { return null as any; }

// ==================== PREPARE TASKS SCREEN ====================
function PrepareTasksScreen(_props: any) { return null as any; }

// ==================== TASK TEMPLATES SCREEN ====================
function TaskTemplatesScreen(_props: any) { return null as any; }

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
function PrestatairesScreen({ prestataires, primaryColor, secondaryColor, apiRequest, loadPrestataires }: any) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Prestataire | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  
  // Form state
  const [nomSociete, setNomSociete] = useState('');
  const [contact, setContact] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [tarifs, setTarifs] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setNomSociete('');
    setContact('');
    setTelephone('');
    setEmail('');
    setNote('');
    setTarifs('');
  };

  const handleAddPrestataire = async () => {
    if (!nomSociete.trim()) {
      alert('Le nom de la société est obligatoire');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest('/prestataires', {
        method: 'POST',
        body: JSON.stringify({
          nom_societe: nomSociete.trim(),
          contact: contact.trim() || undefined,
          telephone: telephone.trim() || undefined,
          email: email.trim() || undefined,
          note: note.trim() || undefined,
          tarifs: tarifs.trim() || undefined,
        }),
      });
      setShowAddModal(false);
      resetForm();
      await loadPrestataires();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPrestataire = async () => {
    if (!showEditModal || !nomSociete.trim()) {
      alert('Le nom de la société est obligatoire');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest(`/prestataires/${showEditModal.prestataire_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nom_societe: nomSociete.trim(),
          contact: contact.trim() || undefined,
          telephone: telephone.trim() || undefined,
          email: email.trim() || undefined,
          note: note.trim() || undefined,
          tarifs: tarifs.trim() || undefined,
        }),
      });
      setShowEditModal(null);
      resetForm();
      await loadPrestataires();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePrestataire = async (prestataire: Prestataire) => {
    const confirmed = await showConfirm(`Supprimer le prestataire "${prestataire.nom_societe}" ?`);
    if (!confirmed) return;
    
    try {
      await apiRequest(`/prestataires/${prestataire.prestataire_id}`, { method: 'DELETE' });
      await loadPrestataires();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const openEditModal = (prestataire: Prestataire) => {
    setNomSociete(prestataire.nom_societe);
    setContact(prestataire.contact || '');
    setTelephone(prestataire.telephone || '');
    setEmail(prestataire.email || '');
    setNote(prestataire.note || '');
    setTarifs(prestataire.tarifs || '');
    setShowEditModal(prestataire);
    setShowActionsMenu(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screenContainer}>
        <Text style={[styles.screenTitle, { color: primaryColor }]}>Prestataires</Text>
        
        {prestataires.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <WebIcon name="construct-outline" size={60} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 16, textAlign: 'center' }}>
              Aucun prestataire enregistré.{'\n'}Ajoutez vos prestataires pour les événements.
            </Text>
          </View>
        ) : (
          prestataires.map((p: Prestataire) => (
            <View key={p.prestataire_id} style={[styles.userItem, { zIndex: showActionsMenu === p.prestataire_id ? 1000 : 1, overflow: 'visible' }]}>
              <View style={styles.userItemLeft}>
                <View style={[styles.userAvatar, { backgroundColor: primaryColor }]}>
                  <WebIcon name="construct" size={20} color={secondaryColor} />
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName2, { color: primaryColor }]}>{p.nom_societe}</Text>
                  {p.contact && <Text style={styles.userEmail}>{p.contact}</Text>}
                  {p.telephone && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <WebIcon name="call-outline" size={14} color="#666" />
                      <Text style={{ color: '#666', fontSize: 13, marginLeft: 4 }}>{p.telephone}</Text>
                    </View>
                  )}
                  {p.email && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <WebIcon name="mail-outline" size={14} color="#666" />
                      <Text style={{ color: '#666', fontSize: 13, marginLeft: 4 }}>{p.email}</Text>
                    </View>
                  )}
                  {p.tarifs && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={[styles.permissionBadge, { backgroundColor: `${primaryColor}20`, color: primaryColor }]}>
                        💰 {p.tarifs}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              
              <View style={{ position: 'relative', zIndex: showActionsMenu === p.prestataire_id ? 1001 : 1 }}>
                <TouchableOpacity 
                  style={[styles.userActionButton, { backgroundColor: primaryColor, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
                  onPress={() => setShowActionsMenu(showActionsMenu === p.prestataire_id ? null : p.prestataire_id)}
                >
                  <WebIcon name="create-outline" size={18} color={secondaryColor} />
                  <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 14 }}>Modifier</Text>
                  <WebIcon name={showActionsMenu === p.prestataire_id ? "chevron-up" : "chevron-down"} size={16} color={secondaryColor} />
                </TouchableOpacity>
                
                {showActionsMenu === p.prestataire_id && (
                  <View style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    right: 0, 
                    marginTop: 4,
                    backgroundColor: '#fff', 
                    borderRadius: 8, 
                    shadowColor: '#000', 
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3, 
                    shadowRadius: 12,
                    elevation: 10,
                    minWidth: 200,
                    zIndex: 9999,
                    borderWidth: 1,
                    borderColor: '#ddd'
                  }}>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                      onPress={() => openEditModal(p)}
                    >
                      <WebIcon name="create-outline" size={18} color="#2196F3" />
                      <Text style={{ marginLeft: 10, color: '#333', fontSize: 14 }}>Modifier les infos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}
                      onPress={() => { handleDeletePrestataire(p); setShowActionsMenu(null); }}
                    >
                      <WebIcon name="trash-outline" size={18} color="#ff4444" />
                      <Text style={{ marginLeft: 10, color: '#ff4444', fontSize: 14 }}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Bouton Ajouter */}
      <TouchableOpacity 
        style={[styles.addButton, { backgroundColor: primaryColor }]} 
        onPress={() => { resetForm(); setShowAddModal(true); }}
      >
        <WebIcon name="add" size={32} color={secondaryColor} />
      </TouchableOpacity>

      {/* Modal Ajouter/Modifier Prestataire - Version scrollable */}
      <Modal visible={showAddModal || showEditModal !== null} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', width: '100%', maxWidth: 500, maxHeight: '85%', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header fixe */}
            <View style={{ backgroundColor: primaryColor, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>
                {showEditModal ? 'Modifier le prestataire' : 'Nouveau prestataire'}
              </Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setShowEditModal(null); resetForm(); }}>
                <WebIcon name="close" size={24} color={secondaryColor} />
              </TouchableOpacity>
            </View>
            
            {/* Contenu scrollable */}
            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={true}>
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Nom de la société *</Text>
              <TextInput
                style={[styles.input, { borderColor: primaryColor }]}
                value={nomSociete}
                onChangeText={setNomSociete}
                placeholder="Ex: Traiteur Dupont"
              />
              
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Contact</Text>
              <TextInput
                style={[styles.input, { borderColor: primaryColor }]}
                value={contact}
                onChangeText={setContact}
                placeholder="Nom du contact (optionnel)"
              />
              
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Téléphone</Text>
              <TextInput
                style={[styles.input, { borderColor: primaryColor }]}
                value={telephone}
                onChangeText={setTelephone}
                placeholder="06 12 34 56 78 (optionnel)"
                keyboardType="phone-pad"
              />
              
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Email</Text>
              <TextInput
                style={[styles.input, { borderColor: primaryColor }]}
                value={email}
                onChangeText={setEmail}
                placeholder="contact@exemple.com (optionnel)"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Tarifs</Text>
              <TextInput
                style={[styles.input, { borderColor: primaryColor }]}
                value={tarifs}
                onChangeText={setTarifs}
                placeholder="Ex: 50€/h, forfait 500€ (optionnel)"
              />
              
              <Text style={[styles.inputLabel, { color: primaryColor }]}>Note</Text>
              <TextInput
                style={[styles.input, styles.textArea, { borderColor: primaryColor }]}
                value={note}
                onChangeText={setNote}
                placeholder="Notes ou remarques (optionnel)"
                multiline
                numberOfLines={3}
              />
              
              {/* Espace en bas pour éviter que le contenu soit masqué */}
              <View style={{ height: 20 }} />
            </ScrollView>
            
            {/* Boutons fixes en bas */}
            <View style={{ flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: 'white' }}>
              <TouchableOpacity 
                style={{ flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#eee', marginRight: 8, alignItems: 'center' }} 
                onPress={() => { setShowAddModal(false); setShowEditModal(null); resetForm(); }}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: primaryColor, marginLeft: 8, alignItems: 'center' }} 
                onPress={showEditModal ? handleEditPrestataire : handleAddPrestataire}
                disabled={isSubmitting}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>
                  {isSubmitting ? 'En cours...' : (showEditModal ? 'Enregistrer' : 'Ajouter')}
                </Text>
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
function PermanentTasksScreen(_props: any) { return null as any; }

// ==================== MENU GROUPE SCREEN ====================
function MenuGroupeScreen({ sections, items, reservations, primaryColor, secondaryColor, apiRequest, loadSections, loadItems, loadReservations, onCreateGroup, restaurant, sessionToken }: any) {
  const [activeTab, setActiveTab] = useState<'sections' | 'reservations' | 'options'>('reservations');
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionDesc, setNewSectionDesc] = useState('');
  const [newSectionPrice, setNewSectionPrice] = useState('');  // Prix de la sous-section
  const [newSectionParentId, setNewSectionParentId] = useState<string | null>(null);  // Section parente
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  
  // Charger les réservations au montage du composant
  useEffect(() => {
    console.log('[MenuGroupeScreen] Component mounted, loading reservations...');
    loadReservations();
    loadGroupOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // État pour le filtre des réservations (actives, archivées, supprimées)
  const [reservationFilter, setReservationFilter] = useState<'active' | 'archived' | 'deleted'>('active');
  const [archivedReservations, setArchivedReservations] = useState<any[]>([]);
  const [deletedReservations, setDeletedReservations] = useState<any[]>([]);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  
  // Options configurables pour les groupes
  const [groupOptions, setGroupOptions] = useState<any[]>([]);
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionDesc, setNewOptionDesc] = useState('');
  const [newOptionIsFreeText, setNewOptionIsFreeText] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  
  // PDF Viewer state pour Proposition/Facture
  const [showResPdfViewer, setShowResPdfViewer] = useState(false);
  const [resPdfUrl, setResPdfUrl] = useState<string | null>(null);
  const [resPdfType, setResPdfType] = useState<'proposition' | 'facture'>('proposition');
  
  // Charger les réservations archivées
  const loadArchivedReservations = async () => {
    try {
      const data = await apiRequest('/group-reservations/list?include_archived=true');
      setArchivedReservations(data);
    } catch (error) {
      console.error('Erreur chargement archives:', error);
    }
  };
  
  // Charger les réservations supprimées
  const loadDeletedReservations = async () => {
    try {
      const data = await apiRequest('/group-reservations/list?include_deleted=true');
      setDeletedReservations(data);
    } catch (error) {
      console.error('Erreur chargement corbeille:', error);
    }
  };
  
  // Archiver/Désarchiver une réservation
  const toggleArchiveReservation = async (reservationId: string) => {
    try {
      await apiRequest(`/group-reservations/${reservationId}/archive`, { method: 'PUT' });
      loadReservations();
      loadArchivedReservations();
      showAlert('Succès', 'Réservation archivée');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Restaurer une réservation supprimée
  const restoreReservation = async (reservationId: string) => {
    try {
      await apiRequest(`/group-reservations/${reservationId}/restore`, { method: 'PUT' });
      loadReservations();
      loadDeletedReservations();
      showAlert('Succès', 'Réservation restaurée');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Supprimer définitivement
  const permanentlyDeleteReservation = async (reservationId: string, clientName: string) => {
    if (!confirm(`Supprimer DÉFINITIVEMENT la réservation de ${clientName} ? Cette action est irréversible.`)) return;
    try {
      await apiRequest(`/group-reservations/${reservationId}/permanent`, { method: 'DELETE' });
      loadDeletedReservations();
      showAlert('Succès', 'Réservation supprimée définitivement');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Charger les options du groupe
  const loadGroupOptions = async () => {
    try {
      const data = await apiRequest('/group-options/list');
      setGroupOptions(data);
    } catch (error) {
      console.error('Erreur chargement options:', error);
    }
  };
  
  useEffect(() => {
    loadGroupOptions();
  }, []);
  
  // Ouvrir le PDF viewer pour Proposition ou Facture
  // Sur iOS PWA, on télécharge directement car les iframes/objects ne fonctionnent pas bien
  const openResPdfViewer = async (reservationId: string, pdfType: 'proposition' | 'facture') => {
    const pdfUrl = `${API_URL}/group-reservations/${reservationId}/pdf?pdf_type=${pdfType}&token=${sessionToken}`;
    
    // Détecter si on est sur iOS PWA - dans ce cas, télécharger directement
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (isIOS && isPWA) {
      // Sur iOS PWA, utiliser directement navigator.share pour un téléchargement fiable
      const filename = `${pdfType}_${new Date().toISOString().split('T')[0]}.pdf`;
      await downloadOrShareFile(pdfUrl, filename, 'application/pdf');
    } else {
      // Sur desktop/Android, afficher le modal de prévisualisation
      setResPdfUrl(pdfUrl);
      setResPdfType(pdfType);
      setShowResPdfViewer(true);
    }
  };
  
  // Fermer le PDF viewer
  const closeResPdfViewer = () => {
    setShowResPdfViewer(false);
    setResPdfUrl(null);
  };
  
  // Télécharger le PDF depuis le viewer (utilise la fonction universelle PWA)
  const downloadResPdf = async () => {
    if (resPdfUrl) {
      const filename = `${resPdfType}_${new Date().toISOString().split('T')[0]}.pdf`;
      await downloadOrShareFile(resPdfUrl, filename, 'application/pdf');
    }
  };
  
  // État pour l'envoi Zelty
  const [sendingToZelty, setSendingToZelty] = useState<string | null>(null);
  
  // Envoyer la commande à la caisse Zelty
  const sendToZelty = async (reservation: any) => {
    if (!reservation.client_selections || Object.keys(reservation.client_selections).length === 0) {
      showAlert('Erreur', 'Aucune sélection client à envoyer');
      return;
    }
    
    setSendingToZelty(reservation.reservation_id);
    
    try {
      // Récupérer les items du menu pour avoir les zelty_id
      const menuItemsResponse = await apiRequest('/menu-items');
      const allMenuItems = await menuItemsResponse.json();
      
      // Construire la liste des items avec leur zelty_id
      const zeltyItems: any[] = [];
      let itemsWithoutZeltyId: string[] = [];
      
      Object.entries(reservation.client_selections).forEach(([itemId, selection]) => {
        const menuItem = allMenuItems.find((mi: any) => mi.item_id === itemId);
        if (menuItem) {
          // Gérer les deux formats: ancien {itemId: number} et nouveau {itemId: {quantity, cooking_option}}
          const quantity = typeof selection === 'number' ? selection : (selection as any).quantity;
          const cookingOption = typeof selection === 'object' ? (selection as any).cooking_option : null;
          
          if (menuItem.zelty_id) {
            zeltyItems.push({
              zelty_id: menuItem.zelty_id,
              quantity: quantity,
              name: menuItem.name,
              cooking_option: cookingOption,
              notes: null
            });
          } else {
            itemsWithoutZeltyId.push(menuItem.name);
          }
        }
      });
      
      if (zeltyItems.length === 0) {
        showAlert('Erreur', `Aucun produit n'a d'ID Zelty configuré.\n\nPlats sans ID Zelty:\n${itemsWithoutZeltyId.join('\n')}\n\nAllez dans Menu Restaurant > Modifier le plat > ID Zelty pour configurer.`);
        setSendingToZelty(null);
        return;
      }
      
      // Envoyer à Zelty
      const response = await apiRequest('/zelty/send-order', {
        method: 'POST',
        body: JSON.stringify({
          reservation_id: reservation.reservation_id,
          table_number: reservation.table_number || '1',
          customer_name: `${reservation.client_name} ${reservation.client_surname || ''}`.trim(),
          items: zeltyItems,
          notes: reservation.notes || null
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        let message = `✅ Commande envoyée à la caisse !\n\n${result.items_count} produit(s) envoyé(s)`;
        if (itemsWithoutZeltyId.length > 0) {
          message += `\n\n⚠️ Non envoyés (sans ID Zelty):\n${itemsWithoutZeltyId.join('\n')}`;
        }
        showAlert('Succès', message);
        // Recharger les réservations pour mettre à jour le statut
        loadGroupReservations();
      } else {
        showAlert('Erreur Zelty', result.detail || 'Erreur lors de l\'envoi à la caisse');
      }
    } catch (error: any) {
      console.error('Erreur envoi Zelty:', error);
      showAlert('Erreur', error.message || 'Impossible d\'envoyer à la caisse');
    }
    
    setSendingToZelty(null);
  };
  
  const addGroupOption = async () => {
    if (!newOptionName.trim()) return;
    try {
      await apiRequest('/group-options/create', {
        method: 'POST',
        body: JSON.stringify({
          name: newOptionName,
          description: newOptionDesc || null,
          is_free_text: newOptionIsFreeText
        })
      });
      setNewOptionName('');
      setNewOptionDesc('');
      setNewOptionIsFreeText(false);
      setShowAddOption(false);
      loadGroupOptions();
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const deleteGroupOption = async (optionId: string) => {
    if (Platform.OS === 'web') {
      if (!(await showConfirm('Supprimer cette option ?'))) return;
    }
    try {
      await apiRequest(`/group-options/${optionId}`, { method: 'DELETE' });
      loadGroupOptions();
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  // Générer le lien public
  const getPublicLink = () => {
    if (!restaurant?.restaurant_id) return '';
    return `${API_BASE_URL}?group_request=${restaurant.restaurant_id}`;
  };
  
  const copyPublicLink = () => {
    const link = getPublicLink();
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } else {
      showAlert('Lien', link);
    }
  };
  
  // Privatisation Spaces State and Functions
  const [privatisationSpaces, setPrivatisationSpaces] = useState<any[]>([]);
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [editingSpace, setEditingSpace] = useState<any>(null);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceDesc, setNewSpaceDesc] = useState('');
  const [newSpaceCapacityMin, setNewSpaceCapacityMin] = useState('');
  const [newSpaceCapacityMax, setNewSpaceCapacityMax] = useState('');
  const [newSpaceAmenities, setNewSpaceAmenities] = useState('');
  const [newSpacePriceInfo, setNewSpacePriceInfo] = useState('');
  const [newSpacePriceUnderMin, setNewSpacePriceUnderMin] = useState('');
  const [newSpacePhotos, setNewSpacePhotos] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  const loadPrivatisationSpaces = async () => {
    try {
      const data = await apiRequest('/privatisation-spaces/list');
      setPrivatisationSpaces(data);
    } catch (error) {
      console.error('Erreur chargement espaces:', error);
    }
  };
  
  useEffect(() => {
    loadPrivatisationSpaces();
  }, []);
  
  const addPrivatisationSpace = async () => {
    if (!newSpaceName.trim()) return;
    try {
      await apiRequest('/privatisation-spaces/create', {
        method: 'POST',
        body: JSON.stringify({
          name: newSpaceName,
          description: newSpaceDesc || null,
          capacity_min: newSpaceCapacityMin ? parseInt(newSpaceCapacityMin) : null,
          capacity_max: newSpaceCapacityMax ? parseInt(newSpaceCapacityMax) : null,
          amenities: newSpaceAmenities ? newSpaceAmenities.split(',').map(a => a.trim()) : [],
          price_info: newSpacePriceInfo || null,
          price_under_minimum: newSpacePriceUnderMin ? parseFloat(newSpacePriceUnderMin) : null,
          photos: newSpacePhotos
        })
      });
      resetSpaceForm();
      loadPrivatisationSpaces();
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const deletePrivatisationSpace = async (spaceId: string) => {
    if (Platform.OS === 'web') {
      if (!(await showConfirm('Supprimer cet espace ?'))) return;
    }
    try {
      await apiRequest(`/privatisation-spaces/${spaceId}`, { method: 'DELETE' });
      loadPrivatisationSpaces();
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const openEditSpace = (space: any) => {
    setEditingSpace(space);
    setNewSpaceName(space.name || '');
    setNewSpaceDesc(space.description || '');
    setNewSpaceCapacityMin(space.capacity_min?.toString() || '');
    setNewSpaceCapacityMax(space.capacity_max?.toString() || '');
    setNewSpaceAmenities(space.amenities?.join(', ') || '');
    setNewSpacePriceInfo(space.price_info || '');
    setNewSpacePriceUnderMin(space.price_under_minimum?.toString() || '');
    setNewSpacePhotos(space.photos || []);
    setShowAddSpace(true);
  };
  
  const updatePrivatisationSpace = async () => {
    if (!editingSpace || !newSpaceName.trim()) return;
    try {
      await apiRequest(`/privatisation-spaces/${editingSpace.space_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: newSpaceName,
          description: newSpaceDesc || null,
          capacity_min: newSpaceCapacityMin ? parseInt(newSpaceCapacityMin) : null,
          capacity_max: newSpaceCapacityMax ? parseInt(newSpaceCapacityMax) : null,
          amenities: newSpaceAmenities ? newSpaceAmenities.split(',').map(a => a.trim()) : [],
          price_info: newSpacePriceInfo || null,
          price_under_minimum: newSpacePriceUnderMin ? parseFloat(newSpacePriceUnderMin) : null,
          photos: newSpacePhotos
        })
      });
      resetSpaceForm();
      loadPrivatisationSpaces();
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const resetSpaceForm = () => {
    setNewSpaceName('');
    setNewSpaceDesc('');
    setNewSpaceCapacityMin('');
    setNewSpaceCapacityMax('');
    setNewSpaceAmenities('');
    setNewSpacePriceInfo('');
    setNewSpacePriceUnderMin('');
    setNewSpacePhotos([]);
    setEditingSpace(null);
    setShowAddSpace(false);
  };
  
  const handleSpacePhotoUpload = async () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setIsUploadingPhoto(true);
      try {
        // Upload vers le serveur
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_URL}/upload/image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
          body: formData
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Erreur upload');
        }
        
        const result = await response.json();
        // Sauvegarder l'URL publique au lieu du base64
        setNewSpacePhotos([...newSpacePhotos, result.url]);
        setIsUploadingPhoto(false);
      } catch (error: any) {
        showAlert('Erreur', error.message || 'Erreur lors de l\'upload');
        setIsUploadingPhoto(false);
      }
    };
    input.click();
  };
  
  const removeSpacePhoto = (index: number) => {
    setNewSpacePhotos(newSpacePhotos.filter((_, i) => i !== index));
  };
  
  // Liste des allergènes pour le filtre Carte Food
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
  
  // État pour le sélecteur Carte Food
  const [showCarteFoodSelector, setShowCarteFoodSelector] = useState<string | null>(null);  // section_id
  const [carteFoodSections, setCarteFoodSections] = useState<any[]>([]);
  const [carteFoodItems, setCarteFoodItems] = useState<any[]>([]);
  const [carteFoodSearchQuery, setCarteFoodSearchQuery] = useState('');
  const [isLoadingCarteFood, setIsLoadingCarteFood] = useState(false);
  const [carteFoodAllergenFilter, setCarteFoodAllergenFilter] = useState<string[]>([]);
  const [showCarteFoodAllergenModal, setShowCarteFoodAllergenModal] = useState(false);
  const [carteFoodTab, setCarteFoodTab] = useState<'food' | 'boisson'>('food');
  const [carteFoodSelectedSection, setCarteFoodSelectedSection] = useState<string | null>(null);
  // State pour le modal de sélection de format (Petite/Grande)
  const [showFormatSelector, setShowFormatSelector] = useState<any | null>(null);
  
  // Charger les données de la Carte Food ET Boisson
  const loadCarteFoodData = async () => {
    setIsLoadingCarteFood(true);
    try {
      // Charger toutes les sections et items depuis le Menu Restaurant (pas le menu groupe!)
      const sectionsData = await apiRequest('/menu-restaurant/sections/list');
      const itemsData = await apiRequest('/menu-restaurant/items/list');
      setCarteFoodSections(sectionsData);
      setCarteFoodItems(itemsData);
    } catch (error: any) {
      console.error('Erreur chargement Carte Food:', error);
    }
    setIsLoadingCarteFood(false);
  };
  
  // Sélectionner un produit de la Carte Food
  const selectFromCarteFood = async (item: any) => {
    if (!showCarteFoodSelector) return;
    
    // Si le produit a plusieurs formats, ouvrir le modal de sélection
    const hasMultiFormats = item.formats && item.formats.length > 1;
    console.log('[selectFromCarteFood] item:', item.name, 'formats:', item.formats?.length, 'hasMultiFormats:', hasMultiFormats);
    if (hasMultiFormats) {
      console.log('[selectFromCarteFood] Opening format selector modal');
      setShowFormatSelector({ item, targetSectionId: showCarteFoodSelector });
      return;
    }
    
    // Sinon, ajouter directement
    try {
      const formatInfo = item.formats?.length === 1 ? ` (${item.formats[0].name})` : '';
      await apiRequest('/menu-items/create', { 
        method: 'POST', 
        body: JSON.stringify({ 
          section_id: showCarteFoodSelector, 
          name: item.name + formatInfo, 
          description: item.descriptions?.join('\n') || item.description || null
        }) 
      });
      loadItems();
      setShowCarteFoodSelector(null);
      setCarteFoodSearchQuery('');
    } catch (error: any) { showAlert('Erreur', error.message); }
  };
  
  // Ajouter un produit avec un format spécifique
  const selectFromCarteFoodWithFormat = async (item: any, format: any, targetSectionId: string) => {
    try {
      await apiRequest('/menu-items/create', { 
        method: 'POST', 
        body: JSON.stringify({ 
          section_id: targetSectionId, 
          name: `${item.name} (${format.name})`, 
          description: item.descriptions?.join('\n') || item.description || null
        }) 
      });
      loadItems();
      setShowFormatSelector(null);
      setShowCarteFoodSelector(null);
      setCarteFoodSearchQuery('');
    } catch (error: any) { showAlert('Erreur', error.message); }
  };
  
  // Debug: vérifier si sessionToken est reçu
  useEffect(() => {
    console.log('MenuGroupeScreen - sessionToken:', sessionToken ? 'présent' : 'ABSENT');
  }, [sessionToken]);
  
  // État pour l'édition de section
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editSectionDesc, setEditSectionDesc] = useState('');
  const [editSectionPrice, setEditSectionPrice] = useState('');  // Prix pour l'édition
  
  // État pour l'édition de réservation
  const [editingReservation, setEditingReservation] = useState<any>(null);
  const [editResClientSelections, setEditResClientSelections] = useState<{[key: string]: number}>({});
  const [editSelectedSections, setEditSelectedSections] = useState<string[]>([]);
  const [editSelectedItems, setEditSelectedItems] = useState<{[key: string]: string[]}>({});
  // Options personnalisées pour l'édition avec quantité et TVA
  const [editCustomOptions, setEditCustomOptions] = useState<{name: string; price: string; quantity: string; tva_rate: string}[]>([]);
  // Informations client pour l'édition
  const [editClientName, setEditClientName] = useState('');
  const [editClientSurname, setEditClientSurname] = useState('');
  const [editClientCompany, setEditClientCompany] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientAddressStreet, setEditClientAddressStreet] = useState('');
  const [editClientAddressPostalCode, setEditClientAddressPostalCode] = useState('');
  const [editClientAddressCity, setEditClientAddressCity] = useState('');
  const [editClientIsCreditClient, setEditClientIsCreditClient] = useState(false);

  const addSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      // Prix uniquement si c'est une sous-section
      const priceValue = newSectionParentId && newSectionPrice ? parseFloat(newSectionPrice.replace(',', '.')) : null;
      await apiRequest('/menu-sections/create', { 
        method: 'POST', 
        body: JSON.stringify({ 
          name: newSectionName, 
          description: newSectionDesc || null,
          price: priceValue,
          parent_section_id: newSectionParentId  // null pour section principale
        }) 
      });
      setNewSectionName(''); setNewSectionDesc(''); setNewSectionPrice(''); setNewSectionParentId(null); setShowAddSection(false);
      loadSections();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const addItem = async (sectionId: string) => {
    if (!newItemName.trim()) return;
    try {
      await apiRequest('/menu-items/create', { method: 'POST', body: JSON.stringify({ section_id: sectionId, name: newItemName, description: newItemDesc }) });
      setNewItemName(''); setNewItemDesc(''); setShowAddItem(null);
      loadItems();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };
  
  const startEditSection = (section: MenuSection) => {
    setEditingSection(section.section_id);
    setEditSectionName(section.name);
    setEditSectionDesc(section.description || '');
    setEditSectionPrice(section.price ? String(section.price) : '');
  };
  
  const saveEditSection = async () => {
    if (!editSectionName.trim() || !editingSection) return;
    try {
      const priceValue = editSectionPrice ? parseFloat(editSectionPrice.replace(',', '.')) : null;
      await apiRequest(`/menu-sections/${editingSection}`, { 
        method: 'PUT', 
        body: JSON.stringify({ 
          name: editSectionName, 
          description: editSectionDesc || null,
          price: priceValue
        }) 
      });
      setEditingSection(null);
      setEditSectionName('');
      setEditSectionDesc('');
      setEditSectionPrice('');
      loadSections();
    } catch (error: any) { showAlert('Erreur', error.message); }
  };

  const deleteSection = async (sectionId: string) => {
    showAlert('Supprimer', 'Supprimer cette section et tous ses plats ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await apiRequest(`/menu-sections/${sectionId}`, { method: 'DELETE' }); loadSections(); loadItems(); }
        catch (error: any) { showAlert('Erreur', error.message); }
      }}
    ]);
  };

  const deleteItem = async (itemId: string) => {
    try { await apiRequest(`/menu-items/${itemId}`, { method: 'DELETE' }); loadItems(); }
    catch (error: any) { showAlert('Erreur', error.message); }
  };

  // Fonction pour réordonner une section (monter ou descendre)
  const reorderSection = async (sectionId: string, direction: 'up' | 'down') => {
    try {
      await apiRequest(`/menu-sections/${sectionId}/reorder?direction=${direction}`, { method: 'PUT' });
      loadSections();
    } catch (error: any) { 
      Platform.OS === 'web' ? alert('Erreur: ' + error.message) : showAlert('Erreur', error.message); 
    }
  };
  
  // Fonctions pour l'édition de réservation
  const openEditReservation = (res: any) => {
    setEditingReservation(res);
    // Initialiser les sélections du client (quantités)
    const selections: {[key: string]: number} = {};
    if (res.client_selections) {
      Object.entries(res.client_selections).forEach(([itemId, qty]) => {
        selections[itemId] = qty as number;
      });
    }
    setEditResClientSelections(selections);
    // Initialiser les sections et items sélectionnés
    setEditSelectedSections(res.selected_sections || []);
    setEditSelectedItems(res.selected_items || {});
    // Initialiser les options personnalisées existantes avec quantité et TVA
    const existingOptions = res.custom_options || [];
    setEditCustomOptions(existingOptions.map((opt: any) => ({
      name: opt.name || '',
      price: opt.price ? String(opt.price) : '',
      quantity: opt.quantity ? String(opt.quantity) : '1',
      tva_rate: opt.tva_rate !== undefined ? String(opt.tva_rate) : '20'
    })));
    // Initialiser les informations client
    setEditClientName(res.client_name || '');
    setEditClientSurname(res.client_surname || '');
    setEditClientCompany(res.client_company || '');
    setEditClientEmail(res.client_email || '');
    setEditClientPhone(res.client_phone || '');
    setEditClientAddressStreet(res.client_address_street || '');
    setEditClientAddressPostalCode(res.client_address_postal_code || '');
    setEditClientAddressCity(res.client_address_city || '');
    // Initialiser le crédit client
    setEditClientIsCreditClient(res.is_credit_client || false);
  };
  
  const saveEditReservation = async () => {
    if (!editingReservation) return;
    try {
      // Nettoyer les sélections : supprimer les quantités pour les items qui ne sont plus sélectionnés
      const cleanedSelections: {[key: string]: number} = {};
      Object.entries(editResClientSelections).forEach(([itemId, qty]) => {
        // Vérifier si l'item est toujours dans les sections sélectionnées
        const isItemSelected = Object.values(editSelectedItems).flat().includes(itemId);
        if (isItemSelected && qty > 0) {
          cleanedSelections[itemId] = qty;
        }
      });
      
      // Préparer les options personnalisées avec quantité et TVA (filtrer les vides)
      const validOptions = editCustomOptions
        .filter(opt => opt.name.trim())
        .map(opt => ({ 
          name: opt.name.trim(), 
          price: opt.price ? parseFloat(opt.price) : null,
          quantity: opt.quantity ? parseInt(opt.quantity) : 1,
          tva_rate: opt.tva_rate ? parseFloat(opt.tva_rate) : 20
        }));
      
      await apiRequest(`/group-reservations/${editingReservation.reservation_id}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          client_name: editClientName,
          client_surname: editClientSurname,
          client_company: editClientCompany || null,
          client_email: editClientEmail || null,
          client_phone: editClientPhone || null,
          client_address_street: editClientAddressStreet || null,
          client_address_postal_code: editClientAddressPostalCode || null,
          client_address_city: editClientAddressCity || null,
          is_credit_client: editClientIsCreditClient,
          client_selections: cleanedSelections,
          selected_sections: editSelectedSections,
          selected_items: editSelectedItems,
          custom_options: validOptions.length > 0 ? validOptions : []
        })
      });
      setEditingReservation(null);
      setEditResClientSelections({});
      setEditSelectedSections([]);
      setEditSelectedItems({});
      setEditCustomOptions([]);
      // Reset client fields
      setEditClientName(''); setEditClientSurname(''); setEditClientCompany('');
      setEditClientEmail(''); setEditClientPhone('');
      setEditClientAddressStreet(''); setEditClientAddressPostalCode(''); setEditClientAddressCity('');
      setEditClientIsCreditClient(false);
      loadReservations();
      showAlert('Succès', 'Réservation modifiée');
    } catch (error: any) { showAlert('Erreur', error.message); }
  };
  
  // Fonction pour toggle une section entière dans l'édition
  const toggleEditSection = (sectionId: string) => {
    setEditSelectedSections(prev => {
      if (prev.includes(sectionId)) {
        // Supprimer la section et ses items
        const newItems = { ...editSelectedItems };
        delete newItems[sectionId];
        setEditSelectedItems(newItems);
        return prev.filter(id => id !== sectionId);
      } else {
        // Ajouter la section (sans items initialement)
        setEditSelectedItems(prev => ({ ...prev, [sectionId]: [] }));
        return [...prev, sectionId];
      }
    });
  };
  
  // Fonction pour toggle un item dans l'édition
  const toggleEditItem = (sectionId: string, itemId: string) => {
    setEditSelectedItems(prev => {
      const sectionItems = prev[sectionId] || [];
      if (sectionItems.includes(itemId)) {
        // Supprimer l'item et sa quantité
        const { [itemId]: _, ...restSelections } = editResClientSelections;
        setEditResClientSelections(restSelections);
        return { ...prev, [sectionId]: sectionItems.filter(id => id !== itemId) };
      } else {
        // Ajouter l'item avec quantité 0
        return { ...prev, [sectionId]: [...sectionItems, itemId] };
      }
    });
  };
  
  const updateReservationItemQty = (itemId: string, delta: number) => {
    setEditResClientSelections(prev => {
      const current = prev[itemId] || 0;
      const newQty = Math.max(0, current + delta);
      if (newQty === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: newQty };
    });
  };
  
  // Fonctions pour les options personnalisées dans l'édition
  const addEditCustomOption = () => {
    setEditCustomOptions(prev => [...prev, { name: '', price: '', quantity: '1', tva_rate: '20' }]);
  };
  
  const updateEditCustomOption = (index: number, field: 'name' | 'price' | 'quantity' | 'tva_rate', value: string) => {
    setEditCustomOptions(prev => prev.map((opt, i) => i === index ? { ...opt, [field]: value } : opt));
  };
  
  const removeEditCustomOption = (index: number) => {
    setEditCustomOptions(prev => prev.filter((_, i) => i !== index));
  };
  
  // Fonction pour supprimer une réservation
  const deleteReservation = async (reservationId: string, clientName: string) => {
    const confirmDelete = () => {
      return new Promise<boolean>((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm(`Êtes-vous sûr de vouloir supprimer la réservation de ${clientName} ?`));
        } else {
          showAlert(
            'Supprimer la réservation',
            `Êtes-vous sûr de vouloir supprimer la réservation de ${clientName} ?`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        }
      });
    };
    
    const confirmed = await confirmDelete();
    if (!confirmed) return;
    
    try {
      await apiRequest(`/group-reservations/${reservationId}`, { method: 'DELETE' });
      loadReservations();
      if (Platform.OS === 'web') {
        alert('Réservation supprimée');
      } else {
        showAlert('Succès', 'Réservation supprimée');
      }
    } catch (error: any) { 
      if (Platform.OS === 'web') {
        alert('Erreur: ' + (error.message || 'Impossible de supprimer'));
      } else {
        showAlert('Erreur', error.message || 'Impossible de supprimer'); 
      }
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>Menu Groupe</Text>
        
        {/* Tabs - Réservations en premier */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, backgroundColor: activeTab === 'reservations' ? primaryColor : '#eee', borderRadius: 8, marginRight: 4 }}
            onPress={() => setActiveTab('reservations')}
          >
            <Text style={{ textAlign: 'center', color: activeTab === 'reservations' ? secondaryColor : '#666', fontWeight: '600', fontSize: 13 }}>Réservations</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, backgroundColor: activeTab === 'sections' ? primaryColor : '#eee', borderRadius: 8, marginHorizontal: 4 }}
            onPress={() => setActiveTab('sections')}
          >
            <Text style={{ textAlign: 'center', color: activeTab === 'sections' ? secondaryColor : '#666', fontWeight: '600', fontSize: 13 }}>Formules</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, backgroundColor: activeTab === 'options' ? primaryColor : '#eee', borderRadius: 8, marginLeft: 4 }}
            onPress={() => setActiveTab('options')}
          >
            <Text style={{ textAlign: 'center', color: activeTab === 'options' ? secondaryColor : '#666', fontWeight: '600', fontSize: 13 }}>Options & Lien</Text>
          </TouchableOpacity>
          {/* Bouton menu Archive/Corbeille */}
          <TouchableOpacity 
            style={{ padding: 12, backgroundColor: showFilterMenu ? primaryColor : '#eee', borderRadius: 8, marginLeft: 4, minWidth: 44 }}
            onPress={() => setShowFilterMenu(!showFilterMenu)}
            data-testid="archive-menu-btn"
          >
            <WebIcon name="folder-outline" size={20} color={showFilterMenu ? secondaryColor : '#666'} />
          </TouchableOpacity>
        </View>
        
        {/* Menu déroulant Archive/Corbeille */}
        {showFilterMenu && (
          <View style={{ backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, padding: 12, borderWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Filtrer les réservations</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <TouchableOpacity 
                style={{ flex: 1, minWidth: 100, padding: 12, backgroundColor: reservationFilter === 'active' ? '#d4edda' : '#f8f9fa', borderRadius: 8, borderWidth: 1, borderColor: reservationFilter === 'active' ? '#28a745' : '#dee2e6' }}
                onPress={() => { setReservationFilter('active'); setActiveTab('reservations'); setShowFilterMenu(false); }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <WebIcon name="calendar-outline" size={18} color={reservationFilter === 'active' ? '#28a745' : '#666'} />
                  <Text style={{ marginLeft: 8, color: reservationFilter === 'active' ? '#28a745' : '#666', fontWeight: '600' }}>Actives</Text>
                </View>
                <Text style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 4 }}>{reservations.length} réservation(s)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ flex: 1, minWidth: 100, padding: 12, backgroundColor: reservationFilter === 'archived' ? '#cce5ff' : '#f8f9fa', borderRadius: 8, borderWidth: 1, borderColor: reservationFilter === 'archived' ? '#007bff' : '#dee2e6' }}
                onPress={() => { 
                  setReservationFilter('archived'); 
                  setActiveTab('reservations'); 
                  loadArchivedReservations();
                  setShowFilterMenu(false); 
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <WebIcon name="archive-outline" size={18} color={reservationFilter === 'archived' ? '#007bff' : '#666'} />
                  <Text style={{ marginLeft: 8, color: reservationFilter === 'archived' ? '#007bff' : '#666', fontWeight: '600' }}>Archives</Text>
                </View>
                <Text style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 4 }}>Réservations terminées</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ flex: 1, minWidth: 100, padding: 12, backgroundColor: reservationFilter === 'deleted' ? '#f8d7da' : '#f8f9fa', borderRadius: 8, borderWidth: 1, borderColor: reservationFilter === 'deleted' ? '#dc3545' : '#dee2e6' }}
                onPress={() => { 
                  setReservationFilter('deleted'); 
                  setActiveTab('reservations'); 
                  loadDeletedReservations();
                  setShowFilterMenu(false); 
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <WebIcon name="trash-outline" size={18} color={reservationFilter === 'deleted' ? '#dc3545' : '#666'} />
                  <Text style={{ marginLeft: 8, color: reservationFilter === 'deleted' ? '#dc3545' : '#666', fontWeight: '600' }}>Corbeille</Text>
                </View>
                <Text style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 4 }}>Réservations supprimées</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'sections' && (
          <>
            {/* Add Section Button */}
            <TouchableOpacity 
              style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => { setNewSectionParentId(null); setShowAddSection(true); }}
            >
              <WebIcon name="add-circle-outline" size={22} color={secondaryColor} />
              <Text style={{ color: secondaryColor, fontWeight: '600', marginLeft: 8 }}>Ajouter une section principale</Text>
            </TouchableOpacity>

            {/* Sections List - Structure hiérarchique (Sections > Sous-sections > Plats) */}
            {sections.filter((s: MenuSection) => !s.parent_section_id).map((section: MenuSection, index: number) => {
              const subSections = sections.filter((s: MenuSection) => s.parent_section_id === section.section_id);
              const sectionItems = items.filter((i: MenuItem) => i.section_id === section.section_id);
              
              return (
                <View key={section.section_id} style={{ backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                    {/* Flèches de réordonnement à gauche */}
                    <View style={{ backgroundColor: primaryColor, width: 36, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.2)' }}>
                      <TouchableOpacity 
                        onPress={() => reorderSection(section.section_id, 'up')}
                        disabled={index === 0}
                        style={{ padding: 6, opacity: index === 0 ? 0.3 : 1 }}
                        data-testid={`reorder-up-${section.section_id}`}
                      >
                        <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => reorderSection(section.section_id, 'down')}
                        disabled={index === sections.filter((s: MenuSection) => !s.parent_section_id).length - 1}
                        style={{ padding: 6, opacity: index === sections.filter((s: MenuSection) => !s.parent_section_id).length - 1 ? 0.3 : 1 }}
                        data-testid={`reorder-down-${section.section_id}`}
                      >
                        <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>↓</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {/* Contenu de la section principale */}
                    <TouchableOpacity 
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: primaryColor }}
                      onPress={() => toggleSection(section.section_id)}
                    >
                      <WebIcon name={expandedSections.includes(section.section_id) ? 'chevron-down' : 'chevron-forward'} size={20} color={secondaryColor} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: secondaryColor }}>{section.name}</Text>
                          <Text style={{ color: secondaryColor, opacity: 0.7, marginLeft: 10 }}>
                            {subSections.length > 0 ? `${subSections.length} sous-sections` : `${sectionItems.length} plats`}
                          </Text>
                        </View>
                        {section.description && <Text style={{ color: secondaryColor, opacity: 0.8, fontSize: 13, marginTop: 2 }}>{section.description}</Text>}
                      </View>
                      {/* Boutons d'action */}
                      <TouchableOpacity 
                        onPress={(e) => { e.stopPropagation(); setNewSectionParentId(section.section_id); setShowAddSection(true); }} 
                        style={{ marginLeft: 8, backgroundColor: 'rgba(76,175,80,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 }}
                        data-testid={`add-subsection-${section.section_id}`}
                      >
                        <WebIcon name="add" size={16} color="#81C784" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => startEditSection(section)} 
                        style={{ marginLeft: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 }}
                        data-testid={`edit-section-${section.section_id}`}
                      >
                        <WebIcon name="create-outline" size={16} color={secondaryColor} />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={(e) => { e.stopPropagation(); deleteSection(section.section_id); }} 
                        style={{ marginLeft: 6, backgroundColor: 'rgba(220,53,69,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 }}
                        data-testid={`delete-section-${section.section_id}`}
                      >
                        <WebIcon name="trash-outline" size={16} color="#ffcccc" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                  
                  {expandedSections.includes(section.section_id) && (
                    <View style={{ padding: 12, backgroundColor: '#f9f9f9' }}>
                      {/* Sous-sections */}
                      {subSections.map((subSection: MenuSection, subIndex: number) => {
                        const subItems = items.filter((i: MenuItem) => i.section_id === subSection.section_id);
                        return (
                          <View key={subSection.section_id} style={{ backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' }}>
                            <TouchableOpacity 
                              style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: secondaryColor }}
                              onPress={() => toggleSection(subSection.section_id)}
                            >
                              <WebIcon name={expandedSections.includes(subSection.section_id) ? 'chevron-down' : 'chevron-forward'} size={18} color={primaryColor} />
                              <Text style={{ flex: 1, marginLeft: 8, fontWeight: '600', color: primaryColor }}>{subSection.name}</Text>
                              {subSection.price != null && (
                                <View style={{ backgroundColor: primaryColor, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 8 }}>
                                  <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 14 }}>{subSection.price.toFixed(2)}€</Text>
                                </View>
                              )}
                              <Text style={{ color: '#666', fontSize: 12, marginRight: 8 }}>{subItems.length} plats</Text>
                              <TouchableOpacity onPress={() => startEditSection(subSection)} style={{ padding: 4 }}>
                                <WebIcon name="create-outline" size={16} color={primaryColor} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => deleteSection(subSection.section_id)} style={{ padding: 4, marginLeft: 4 }}>
                                <WebIcon name="trash-outline" size={16} color="#dc3545" />
                              </TouchableOpacity>
                            </TouchableOpacity>
                            
                            {expandedSections.includes(subSection.section_id) && (
                              <View style={{ padding: 10 }}>
                                {subItems.map((item: MenuItem) => (
                                  <View key={item.item_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontWeight: '500', color: primaryColor }}>{item.name}</Text>
                                      {item.description && <Text style={{ color: '#666', fontSize: 12 }}>{item.description}</Text>}
                                    </View>
                                    <TouchableOpacity onPress={() => deleteItem(item.item_id)}>
                                      <WebIcon name="close-circle" size={20} color="#dc3545" />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                                <TouchableOpacity 
                                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginTop: 4 }}
                                  onPress={() => { loadCarteFoodData(); setShowCarteFoodSelector(subSection.section_id); }}
                                >
                                  <WebIcon name="add" size={18} color={primaryColor} />
                                  <Text style={{ color: primaryColor, marginLeft: 6, fontSize: 13 }}>Ajouter un plat</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                      
                      {/* Items directement dans la section (si pas de sous-sections ou anciens items) */}
                      {subSections.length === 0 && sectionItems.map((item: MenuItem) => (
                        <View key={item.item_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '500', color: primaryColor }}>{item.name}</Text>
                            {item.description && <Text style={{ color: '#666', fontSize: 13 }}>{item.description}</Text>}
                          </View>
                          <TouchableOpacity onPress={() => deleteItem(item.item_id)}>
                            <WebIcon name="close-circle" size={22} color="#dc3545" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      
                      {subSections.length === 0 && (
                        <TouchableOpacity 
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginTop: 8 }}
                          onPress={() => { loadCarteFoodData(); setShowCarteFoodSelector(section.section_id); }}
                        >
                          <WebIcon name="add" size={20} color={primaryColor} />
                          <Text style={{ color: primaryColor, marginLeft: 8 }}>Ajouter un plat</Text>
                        </TouchableOpacity>
                      )}
                      
                      {subSections.length > 0 && (
                        <TouchableOpacity 
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' }}
                          onPress={() => { setNewSectionParentId(section.section_id); setShowAddSection(true); }}
                        >
                          <WebIcon name="add-circle-outline" size={20} color={primaryColor} />
                          <Text style={{ color: primaryColor, marginLeft: 8 }}>Ajouter une sous-section</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {sections.filter((s: MenuSection) => !s.parent_section_id).length === 0 && (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <WebIcon name="restaurant-outline" size={48} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 16 }}>Aucune section créée</Text>
                <Text style={{ color: '#999', fontSize: 13 }}>Créez des sections pour organiser votre menu</Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'reservations' && (
          <>
            {/* Titre et indicateur du mode */}
            {reservationFilter !== 'active' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, backgroundColor: reservationFilter === 'archived' ? '#e3f2fd' : '#ffebee', padding: 12, borderRadius: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <WebIcon name={reservationFilter === 'archived' ? 'archive' : 'trash'} size={20} color={reservationFilter === 'archived' ? '#1565c0' : '#dc3545'} />
                  <Text style={{ marginLeft: 8, fontWeight: '600', color: reservationFilter === 'archived' ? '#1565c0' : '#dc3545' }}>
                    {reservationFilter === 'archived' ? 'Archives' : 'Corbeille'}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={{ padding: 8, backgroundColor: '#fff', borderRadius: 6 }}
                  onPress={() => setReservationFilter('active')}
                >
                  <Text style={{ color: '#666', fontSize: 12 }}>← Retour aux actives</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Create Group Button - seulement en mode actif */}
            {reservationFilter === 'active' && (
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                onPress={onCreateGroup}
                data-testid="create-group-btn"
              >
                <WebIcon name="people-outline" size={22} color={secondaryColor} />
                <Text style={{ color: secondaryColor, fontWeight: '600', marginLeft: 8 }}>Créer un groupe</Text>
              </TouchableOpacity>
            )}

            {/* Reservations List - Selon le filtre sélectionné */}
            {[...(reservationFilter === 'active' ? reservations : reservationFilter === 'archived' ? archivedReservations : deletedReservations)]
              .sort((a: GroupReservation, b: GroupReservation) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((res: GroupReservation) => {
              // Déterminer le statut et la couleur à afficher
              const isDirectInvoice = !res.client_token || (res.selected_sections?.length === 0 && !res.price_per_person);
              
              // Statuts de proposition avec couleurs
              const proposalStatusConfig: { [key: string]: { label: string; bg: string; text: string } } = {
                'to_send': { label: 'À envoyer', bg: '#ffebee', text: '#c62828' },        // Rouge
                'sent': { label: 'Envoyé', bg: '#fff3e0', text: '#e65100' },              // Orange
                'validated': { label: 'Validé', bg: '#e8f5e9', text: '#2e7d32' },         // Vert
                'to_invoice': { label: 'À facturer', bg: '#eceff1', text: '#263238' },   // Noir
                'invoiced': { label: 'Facturé', bg: '#e3f2fd', text: '#1565c0' },         // Bleu
                'paid': { label: 'Payé', bg: '#f3e5f5', text: '#7b1fa2' }                 // Violet
              };
              
              // Déterminer quel statut afficher
              let statusDisplay = { label: 'Facture directe', bg: '#d4edda', text: '#155724' };
              
              if (isDirectInvoice) {
                // Facture directe - peut utiliser les mêmes statuts de progression
                const directStatus = res.proposal_status || 'to_invoice';
                if (proposalStatusConfig[directStatus]) {
                  statusDisplay = proposalStatusConfig[directStatus];
                }
              } else if (res.status === 'client_submitted') {
                // Client a validé sa sélection
                const propStatus = res.proposal_status || 'validated';
                statusDisplay = proposalStatusConfig[propStatus] || proposalStatusConfig['validated'];
              } else if (res.selected_sections?.length > 0) {
                // Proposition avec menu
                const propStatus = res.proposal_status || 'to_send';
                statusDisplay = proposalStatusConfig[propStatus] || proposalStatusConfig['to_send'];
              }
              
              return (
              <View key={res.reservation_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: statusDisplay.text }}>
                {/* En-tête avec nom, crédit client et statut */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor }}>{res.client_name} {res.client_surname}</Text>
                      {res.is_credit_client && (
                        <View style={{ backgroundColor: '#fff3cd', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                          <Text style={{ fontSize: 10, color: '#856404', fontWeight: '600' }}>CRÉDIT CLIENT</Text>
                        </View>
                      )}
                    </View>
                    {isDirectInvoice && (
                      <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Facture directe</Text>
                    )}
                  </View>
                  
                  {/* Menu déroulant pour le statut - utilise select natif pour le web */}
                  <View style={{ backgroundColor: statusDisplay.bg, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 }}>
                    <select 
                      value={res.proposal_status || 'to_send'}
                      onChange={async (e: any) => {
                        const newStatus = e.target.value;
                        try {
                          await apiRequest(`/group-reservations/${res.reservation_id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ proposal_status: newStatus })
                          });
                          loadReservations();
                        } catch (err: any) {
                          alert(err.message || 'Erreur lors du changement de statut');
                        }
                      }}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: statusDisplay.text,
                        fontWeight: '600',
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: '4px 8px'
                      }}
                      data-testid={`status-select-${res.reservation_id}`}
                    >
                      <option value="to_send" style={{ color: '#c62828' }}>À envoyer</option>
                      <option value="sent" style={{ color: '#e65100' }}>Envoyé</option>
                      <option value="validated" style={{ color: '#2e7d32' }}>Validé</option>
                      <option value="to_invoice" style={{ color: '#263238' }}>À facturer</option>
                      <option value="invoiced" style={{ color: '#1565c0' }}>Facturé</option>
                      <option value="paid" style={{ color: '#7b1fa2' }}>Payé</option>
                    </select>
                  </View>
                </View>
                
                {/* Infos de la réservation */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Text style={{ color: '#666', marginRight: 16 }}><WebIcon name="people" size={14} /> {res.num_people} pers.</Text>
                  <Text style={{ color: '#666', marginRight: 16 }}><WebIcon name="calendar" size={14} /> {res.date}</Text>
                  <Text style={{ color: '#666' }}><WebIcon name="time" size={14} /> {res.time}</Text>
                </View>
                {res.price_per_person && <Text style={{ color: primaryColor, fontWeight: '600', marginTop: 8 }}>{res.price_per_person.toFixed(2)}€ / personne</Text>}
                
                {/* Affichage des options sélectionnées */}
                {res.custom_options && res.custom_options.length > 0 && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee' }}>
                    <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Options :</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {res.custom_options.map((opt: any, idx: number) => (
                        <View key={idx} style={{ backgroundColor: '#e3f2fd', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: '#1565c0' }}>
                            {opt.name} {opt.quantity > 1 ? `x${opt.quantity}` : ''}
                            {opt.price ? ` - ${(opt.price * (opt.quantity || 1)).toFixed(0)}€` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                
                {/* Affichage des prestations personnalisées ajoutées par le restaurant */}
                {res.extra_prestations && res.extra_prestations.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Prestations ajoutées :</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {res.extra_prestations.map((prest: any, idx: number) => (
                        <View key={idx} style={{ backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                          <Text style={{ fontSize: 12, color: '#e65100' }}>
                            {prest.name} - {prest.price?.toFixed(0) || 0}€
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                
                {/* Actions : Liens et PDFs (ligne 1), Modifier/Archive/Supprimer (ligne 2) */}
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  {/* Ligne 1: Lien, Proposition, Facture */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    {res.status !== 'client_submitted' && res.client_token && (
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4, padding: 8, backgroundColor: `${primaryColor}10`, borderRadius: 6 }}
                        onPress={() => {
                          const link = `${API_BASE_URL}?group_token=${res.client_token}`;
                          if (Platform.OS === 'web') {
                            navigator.clipboard.writeText(link).then(() => {
                              showAlert('Copié !', 'Le lien client a été copié dans le presse-papier');
                            }).catch(() => {
                              showAlert('Lien client', link);
                            });
                          } else {
                            showAlert('Lien client', link);
                          }
                        }}
                        data-testid={`copy-link-${res.reservation_id}`}
                      >
                        <WebIcon name="link-outline" size={18} color={primaryColor} />
                        <Text style={{ color: primaryColor, marginLeft: 6, fontWeight: '500' }}>Lien</Text>
                      </TouchableOpacity>
                    )}
                    
                    {/* Bouton Proposition - uniquement si un menu est sélectionné et pas validé */}
                    {res.status !== 'confirmed' && res.selected_sections?.length > 0 && (
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4, padding: 8, backgroundColor: '#f0f0f0', borderRadius: 6 }}
                        onPress={() => openResPdfViewer(res.reservation_id, 'proposition')}
                        data-testid={`download-proposition-${res.reservation_id}`}
                      >
                        <WebIcon name="document-text-outline" size={18} color="#6c757d" />
                        <Text style={{ color: '#6c757d', marginLeft: 6, fontWeight: '500' }}>Proposition</Text>
                      </TouchableOpacity>
                    )}
                    
                    {/* Bouton Facture - pour validé, facture directe, ou statut à facturer/facturé */}
                    {(res.status === 'confirmed' || isDirectInvoice || res.proposal_status === 'to_invoice' || res.proposal_status === 'invoiced' || res.proposal_status === 'validated') && (
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4, padding: 8, backgroundColor: '#e8f5e9', borderRadius: 6 }}
                        onPress={() => openResPdfViewer(res.reservation_id, 'facture')}
                        data-testid={`download-facture-${res.reservation_id}`}
                      >
                        <WebIcon name="receipt-outline" size={18} color="#28a745" />
                        <Text style={{ color: '#28a745', marginLeft: 6, fontWeight: '500' }}>Facture</Text>
                      </TouchableOpacity>
                    )}
                    
                    {/* Bouton Envoyer à Zelty (caisse) - si le client a fait des sélections */}
                    {res.client_selections && Object.keys(res.client_selections).length > 0 && !res.zelty_order_id && (
                      <TouchableOpacity 
                        style={{ 
                          flexDirection: 'row', 
                          alignItems: 'center', 
                          marginRight: 12, 
                          marginBottom: 4, 
                          padding: 8, 
                          backgroundColor: sendingToZelty === res.reservation_id ? '#ccc' : '#17a2b8', 
                          borderRadius: 6,
                          opacity: sendingToZelty === res.reservation_id ? 0.7 : 1
                        }}
                        onPress={() => sendToZelty(res)}
                        disabled={sendingToZelty === res.reservation_id}
                        data-testid={`send-zelty-${res.reservation_id}`}
                      >
                        {sendingToZelty === res.reservation_id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <WebIcon name="restaurant-outline" size={18} color="#fff" />
                        )}
                        <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600' }}>
                          {sendingToZelty === res.reservation_id ? 'Envoi...' : 'Caisse'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    
                    {/* Badge si déjà envoyé à Zelty */}
                    {res.zelty_order_id && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4, padding: 8, backgroundColor: '#d4edda', borderRadius: 6 }}>
                        <WebIcon name="checkmark-circle" size={18} color="#28a745" />
                        <Text style={{ color: '#28a745', marginLeft: 6, fontWeight: '500', fontSize: 12 }}>Envoyé à la caisse</Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Ligne 2: Modifier, Archive, Supprimer */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {reservationFilter === 'active' && (
                      <>
                        {/* Bouton Modifier */}
                        <TouchableOpacity 
                          style={{ padding: 8, marginRight: 8, backgroundColor: '#e3f2fd', borderRadius: 6 }}
                          onPress={() => openEditReservation(res)}
                          data-testid={`edit-reservation-${res.reservation_id}`}
                        >
                          <WebIcon name="create-outline" size={20} color="#1976d2" />
                        </TouchableOpacity>
                        
                        {/* Bouton Archive */}
                        <TouchableOpacity 
                          style={{ padding: 8, marginRight: 8, backgroundColor: '#fff3e0', borderRadius: 6 }}
                          onPress={() => toggleArchiveReservation(res.reservation_id)}
                          data-testid={`archive-reservation-${res.reservation_id}`}
                        >
                          <WebIcon name="archive-outline" size={20} color="#f57c00" />
                        </TouchableOpacity>
                        
                        {/* Bouton Supprimer */}
                        <TouchableOpacity 
                          style={{ padding: 8, backgroundColor: '#ffebee', borderRadius: 6 }}
                          onPress={() => deleteReservation(res.reservation_id, `${res.client_name} ${res.client_surname}`)}
                          data-testid={`delete-reservation-${res.reservation_id}`}
                        >
                          <WebIcon name="trash" size={20} color="#dc3545" />
                        </TouchableOpacity>
                      </>
                    )}
                    
                    {reservationFilter === 'archived' && (
                      <>
                        {/* Bouton Désarchiver */}
                        <TouchableOpacity 
                          style={{ padding: 8, marginLeft: 8, backgroundColor: '#d4edda', borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => toggleArchiveReservation(res.reservation_id)}
                          data-testid={`unarchive-reservation-${res.reservation_id}`}
                        >
                          <WebIcon name="arrow-undo-outline" size={18} color="#28a745" />
                          <Text style={{ marginLeft: 4, color: '#28a745', fontSize: 12, fontWeight: '500' }}>Désarchiver</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    
                    {reservationFilter === 'deleted' && (
                      <>
                        {/* Bouton Restaurer */}
                        <TouchableOpacity 
                          style={{ padding: 8, marginLeft: 8, backgroundColor: '#d4edda', borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => restoreReservation(res.reservation_id)}
                          data-testid={`restore-reservation-${res.reservation_id}`}
                        >
                          <WebIcon name="refresh-outline" size={18} color="#28a745" />
                          <Text style={{ marginLeft: 4, color: '#28a745', fontSize: 12, fontWeight: '500' }}>Restaurer</Text>
                        </TouchableOpacity>
                        
                        {/* Bouton Supprimer définitivement */}
                        <TouchableOpacity 
                          style={{ padding: 8, marginLeft: 4, backgroundColor: '#f8d7da', borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => permanentlyDeleteReservation(res.reservation_id, `${res.client_name} ${res.client_surname}`)}
                          data-testid={`permanent-delete-reservation-${res.reservation_id}`}
                        >
                          <WebIcon name="close-circle-outline" size={18} color="#dc3545" />
                          <Text style={{ marginLeft: 4, color: '#dc3545', fontSize: 12, fontWeight: '500' }}>Supprimer définitivement</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
              );
            })}

            {(reservationFilter === 'active' ? reservations : reservationFilter === 'archived' ? archivedReservations : deletedReservations).length === 0 && (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <WebIcon name={reservationFilter === 'active' ? 'calendar-outline' : reservationFilter === 'archived' ? 'archive-outline' : 'trash-outline'} size={48} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 16 }}>
                  {reservationFilter === 'active' ? 'Aucune réservation' : reservationFilter === 'archived' ? 'Aucune réservation archivée' : 'Corbeille vide'}
                </Text>
              </View>
            )}
          </>
        )}
        
        {/* Onglet Options & Lien */}
        {activeTab === 'options' && (
          <>
            {/* Lien public de réservation */}
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e0e0e0' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Lien de réservation public</Text>
              <Text style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
                Partagez ce lien sur votre site ou envoyez-le à vos clients pour qu'ils puissent faire une demande de réservation groupe.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12 }}>
                <Text style={{ flex: 1, color: '#333', fontSize: 12 }} numberOfLines={1}>{getPublicLink()}</Text>
                <TouchableOpacity 
                  style={{ backgroundColor: primaryColor, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, marginLeft: 8 }}
                  onPress={copyPublicLink}
                  data-testid="copy-public-link-btn"
                >
                  <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 13 }}>{linkCopied ? '✓ Copié' : 'Copier'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Options configurables */}
            <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Options pour les clients</Text>
            <Text style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
              Les clients pourront sélectionner ces options lors de leur demande de réservation. Les prix seront ajoutés par vous dans la proposition.
            </Text>
            
            <TouchableOpacity 
              style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => setShowAddOption(true)}
              data-testid="add-group-option-btn"
            >
              <WebIcon name="add-circle-outline" size={22} color={secondaryColor} />
              <Text style={{ color: secondaryColor, fontWeight: '600', marginLeft: 8 }}>Ajouter une option</Text>
            </TouchableOpacity>
            
            {groupOptions.map((option: any) => (
              <View key={option.option_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#eee' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: primaryColor }}>{option.name}</Text>
                  {option.description && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{option.description}</Text>}
                  {option.is_free_text && <Text style={{ fontSize: 11, color: '#888', marginTop: 4 }}>📝 Texte libre autorisé</Text>}
                </View>
                <TouchableOpacity 
                  style={{ padding: 8 }}
                  onPress={() => deleteGroupOption(option.option_id)}
                  data-testid={`delete-option-${option.option_id}`}
                >
                  <WebIcon name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </View>
            ))}
            
            {groupOptions.length === 0 && (
              <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 12 }}>
                <WebIcon name="options-outline" size={48} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 12 }}>Aucune option configurée</Text>
                <Text style={{ color: '#bbb', fontSize: 12, marginTop: 4 }}>Ex: DJ, Gâteau anniversaire, Décoration...</Text>
              </View>
            )}
            
            {/* Espaces de privatisation */}
            <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Espaces de privatisation</Text>
              <Text style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
                Configurez vos espaces de privatisation (Bibliothèque, Pergola, etc.) avec photos et capacité.
              </Text>
              
              <TouchableOpacity 
                style={{ backgroundColor: '#9c27b0', padding: 14, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setShowAddSpace(true)}
                data-testid="add-privatisation-space-btn"
              >
                <WebIcon name="business-outline" size={22} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Ajouter un espace</Text>
              </TouchableOpacity>
              
              {privatisationSpaces.map((space: any) => (
                <View key={space.space_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#eee' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: primaryColor }}>{space.name}</Text>
                      {space.description && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }} numberOfLines={2}>{space.description}</Text>}
                      {(space.capacity_min || space.capacity_max) && (
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                          Capacité: {space.capacity_min || '?'} - {space.capacity_max || '?'} pers.
                        </Text>
                      )}
                      {space.photos?.length > 0 && (
                        <Text style={{ fontSize: 11, color: '#9c27b0', marginTop: 4 }}>{space.photos.length} photo(s)</Text>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={{ padding: 8 }}
                      onPress={() => openEditSpace(space)}
                    >
                      <WebIcon name="create-outline" size={20} color="#2196F3" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ padding: 8 }}
                      onPress={() => deletePrivatisationSpace(space.space_id)}
                    >
                      <WebIcon name="trash-outline" size={20} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              
              {privatisationSpaces.length === 0 && (
                <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 12 }}>
                  <WebIcon name="business-outline" size={48} color="#ccc" />
                  <Text style={{ color: '#999', marginTop: 12 }}>Aucun espace configuré</Text>
                  <Text style={{ color: '#bbb', fontSize: 12, marginTop: 4 }}>Ex: Bibliothèque, Pergola, Terrasse...</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>
      
      {/* Modal Add Option */}
      <Modal visible={showAddOption} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor, marginBottom: 16 }}>Nouvelle option</Text>
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
              placeholder="Nom de l'option (ex: DJ, Gâteau...)" 
              value={newOptionName} 
              onChangeText={setNewOptionName} 
            />
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
              placeholder="Description (optionnel)" 
              value={newOptionDesc} 
              onChangeText={setNewOptionDesc} 
            />
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: newOptionIsFreeText ? '#e8f5e9' : '#f5f5f5', borderRadius: 8, marginBottom: 16 }}
              onPress={() => setNewOptionIsFreeText(!newOptionIsFreeText)}
            >
              <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: primaryColor, marginRight: 12, backgroundColor: newOptionIsFreeText ? primaryColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {newOptionIsFreeText && <WebIcon name="checkmark" size={16} color={secondaryColor} />}
              </View>
              <Text style={{ color: '#333' }}>Permettre au client d'ajouter un texte libre</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 8, marginRight: 8 }} 
                onPress={() => { setShowAddOption(false); setNewOptionName(''); setNewOptionDesc(''); setNewOptionIsFreeText(false); }}
              >
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, backgroundColor: primaryColor, borderRadius: 8 }} 
                onPress={addGroupOption}
                data-testid="save-group-option-btn"
              >
                <Text style={{ textAlign: 'center', color: secondaryColor, fontWeight: '600' }}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Add/Edit Privatisation Space */}
      <Modal visible={showAddSpace} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#9c27b0', marginBottom: 16 }}>
              {editingSpace ? 'Modifier l\'espace' : 'Nouvel espace de privatisation'}
            </Text>
            <ScrollView>
              <TextInput 
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
                placeholder="Nom de l'espace (ex: Bibliothèque, Pergola...)" 
                value={newSpaceName} 
                onChangeText={setNewSpaceName} 
              />
              <TextInput 
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, minHeight: 80 }} 
                placeholder="Description (optionnel)" 
                value={newSpaceDesc} 
                onChangeText={setNewSpaceDesc}
                multiline
              />
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Capacité min</Text>
                  <TextInput 
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 }} 
                    placeholder="Ex: 10" 
                    value={newSpaceCapacityMin} 
                    onChangeText={setNewSpaceCapacityMin}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Capacité max</Text>
                  <TextInput 
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 }} 
                    placeholder="Ex: 50" 
                    value={newSpaceCapacityMax} 
                    onChangeText={setNewSpaceCapacityMax}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <TextInput 
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
                placeholder="Équipements (séparés par virgule: Écran, Sono, Wifi...)" 
                value={newSpaceAmenities} 
                onChangeText={setNewSpaceAmenities}
              />
              <TextInput 
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
                placeholder="Info prix (ex: Sur devis, 500€/soirée...)" 
                value={newSpacePriceInfo} 
                onChangeText={setNewSpacePriceInfo}
              />
              
              {/* Prix si sous le minimum */}
              <View style={{ backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: '#856404', marginBottom: 8 }}>Prix si nombre de personnes &lt; capacité min:</Text>
                <TextInput 
                  style={{ borderWidth: 1, borderColor: '#ffc107', borderRadius: 8, padding: 12, backgroundColor: '#fff' }} 
                  placeholder="Ex: 500 (en €)" 
                  value={newSpacePriceUnderMin} 
                  onChangeText={setNewSpacePriceUnderMin}
                  keyboardType="numeric"
                />
              </View>
              
              {/* Section Photos */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, marginTop: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#9c27b0', marginBottom: 12 }}>Photos de l'espace</Text>
                
                {/* Liste des photos */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {newSpacePhotos.map((photo, index) => {
                    // Gérer les URLs et les anciens base64
                    const photoUri = photo.startsWith('http') || photo.startsWith('data:') 
                      ? photo 
                      : `data:image/jpeg;base64,${photo}`;
                    return (
                      <View key={index} style={{ position: 'relative' }}>
                        <Image 
                          source={{ uri: photoUri }} 
                          style={{ width: 80, height: 80, borderRadius: 8 }} 
                        />
                        <TouchableOpacity 
                          style={{ position: 'absolute', top: -8, right: -8, backgroundColor: '#dc3545', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => removeSpacePhoto(index)}
                        >
                          <WebIcon name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                
                {/* Bouton ajouter photo */}
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderWidth: 2, borderColor: '#9c27b0', borderStyle: 'dashed', borderRadius: 8 }}
                  onPress={handleSpacePhotoUpload}
                  disabled={isUploadingPhoto}
                >
                  {isUploadingPhoto ? (
                    <ActivityIndicator color="#9c27b0" />
                  ) : (
                    <>
                      <WebIcon name="camera-outline" size={20} color="#9c27b0" />
                      <Text style={{ color: '#9c27b0', marginLeft: 8, fontWeight: '500' }}>Ajouter une photo</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', marginTop: 16 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 8, marginRight: 8 }} 
                onPress={resetSpaceForm}
              >
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, backgroundColor: '#9c27b0', borderRadius: 8 }} 
                onPress={editingSpace ? updatePrivatisationSpace : addPrivatisationSpace}
              >
                <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '600' }}>
                  {editingSpace ? 'Enregistrer' : 'Ajouter'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Add Section */}
      <Modal visible={showAddSection} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor, marginBottom: 16 }}>
              {newSectionParentId ? 'Nouvelle sous-section' : 'Nouvelle section principale'}
            </Text>
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
              placeholder={newSectionParentId ? "Ex: Entrée 1, Entrée 2..." : "Ex: Entrées, Plats, Desserts..."} 
              value={newSectionName} 
              onChangeText={setNewSectionName} 
            />
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
              placeholder="Description (optionnel)" 
              value={newSectionDesc} 
              onChangeText={setNewSectionDesc} 
            />
            {/* Prix uniquement pour les sous-sections */}
            {newSectionParentId && (
              <TextInput 
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }} 
                placeholder="Prix (ex: 9.90)" 
                value={newSectionPrice} 
                onChangeText={setNewSectionPrice}
                keyboardType="decimal-pad"
              />
            )}
            {!newSectionParentId && (
              <Text style={{ color: '#666', fontSize: 12, marginBottom: 16, fontStyle: 'italic' }}>
                Les sections principales n'ont pas de prix. Ajoutez des sous-sections (Entrée 1, Entrée 2...) avec leurs prix.
              </Text>
            )}
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity style={{ flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 8, marginRight: 8 }} onPress={() => { setShowAddSection(false); setNewSectionName(''); setNewSectionDesc(''); setNewSectionPrice(''); setNewSectionParentId(null); }}>
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 14, backgroundColor: primaryColor, borderRadius: 8 }} onPress={addSection}>
                <Text style={{ textAlign: 'center', color: secondaryColor, fontWeight: '600' }}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Edit Section */}
      <Modal visible={!!editingSection} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor, marginBottom: 16 }}>Modifier la section</Text>
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
              placeholder="Nom de la section" 
              value={editSectionName} 
              onChangeText={setEditSectionName} 
            />
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} 
              placeholder="Description (optionnel)" 
              value={editSectionDesc} 
              onChangeText={setEditSectionDesc} 
            />
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }} 
              placeholder="Prix (ex: 9.90)" 
              value={editSectionPrice} 
              onChangeText={setEditSectionPrice}
              keyboardType="decimal-pad"
            />
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 8, marginRight: 8 }} 
                onPress={() => { setEditingSection(null); setEditSectionName(''); setEditSectionDesc(''); setEditSectionPrice(''); }}
              >
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, backgroundColor: primaryColor, borderRadius: 8 }} 
                onPress={saveEditSection}
                data-testid="save-edit-section-btn"
              >
                <Text style={{ textAlign: 'center', color: secondaryColor, fontWeight: '600' }}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Sélecteur Carte Food/Boisson - Style Menu Client */}
      <Modal visible={!!showCarteFoodSelector} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ flex: 1, marginTop: 50, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            {/* Header avec onglets */}
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor }}>
                  {carteFoodTab === 'food' ? '🍽️ Carte Food' : '🍸 Carte Boisson'}
                </Text>
                <TouchableOpacity onPress={() => { setShowCarteFoodSelector(null); setCarteFoodSearchQuery(''); setCarteFoodAllergenFilter([]); setCarteFoodTab('food'); setCarteFoodSelectedSection(null); }}>
                  <WebIcon name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              {/* Onglets Carte Food / Carte Boisson */}
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 12, 
                    backgroundColor: carteFoodTab === 'food' ? primaryColor : '#f0f0f0',
                    borderRadius: 8,
                    marginRight: 8
                  }}
                  onPress={() => { setCarteFoodTab('food'); setCarteFoodSelectedSection(null); }}
                >
                  <Text style={{ fontSize: 15 }}>🍽️</Text>
                  <Text style={{ color: carteFoodTab === 'food' ? '#fff' : '#666', fontWeight: '600', marginLeft: 6 }}>Carte Food</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 12, 
                    backgroundColor: carteFoodTab === 'boisson' ? primaryColor : '#f0f0f0',
                    borderRadius: 8
                  }}
                  onPress={() => { setCarteFoodTab('boisson'); setCarteFoodSelectedSection(null); }}
                >
                  <Text style={{ fontSize: 15 }}>🍸</Text>
                  <Text style={{ color: carteFoodTab === 'boisson' ? '#fff' : '#666', fontWeight: '600', marginLeft: 6 }}>Carte Boisson</Text>
                </TouchableOpacity>
              </View>
              
              {/* Bouton Ajouter manuellement */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8, marginBottom: 10 }}
                onPress={() => { setShowAddItem(showCarteFoodSelector); setShowCarteFoodSelector(null); setCarteFoodSearchQuery(''); setCarteFoodAllergenFilter([]); }}
                data-testid="add-manual-item-btn"
              >
                <Text style={{ fontSize: 16 }}>✏️</Text>
                <Text style={{ color: '#2e7d32', fontWeight: '600', marginLeft: 8 }}>Ajouter manuellement</Text>
              </TouchableOpacity>
              
              {/* Filtre allergènes */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: carteFoodAllergenFilter.length > 0 ? '#ffebee' : '#f5f5f5', borderRadius: 8, marginBottom: 10 }}
                onPress={() => setShowCarteFoodAllergenModal(true)}
              >
                <Text style={{ fontSize: 16 }}>🥜</Text>
                <Text style={{ marginLeft: 8, color: carteFoodAllergenFilter.length > 0 ? '#c62828' : '#666', fontWeight: '500', flex: 1 }}>
                  {carteFoodAllergenFilter.length > 0 ? `Allergènes exclus (${carteFoodAllergenFilter.length})` : 'Filtrer par allergènes'}
                </Text>
                <WebIcon name={carteFoodAllergenFilter.length > 0 ? "close-circle" : "chevron-forward"} size={20} color={carteFoodAllergenFilter.length > 0 ? '#c62828' : '#999'} />
              </TouchableOpacity>
              
              {/* Barre de recherche */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#eee' }}>
                <WebIcon name="search" size={18} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: '#333' }}
                  placeholder="Rechercher un plat..."
                  placeholderTextColor="#999"
                  value={carteFoodSearchQuery}
                  onChangeText={setCarteFoodSearchQuery}
                />
                {carteFoodSearchQuery ? (
                  <TouchableOpacity onPress={() => setCarteFoodSearchQuery('')}>
                    <WebIcon name="close-circle" size={18} color="#999" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            
            {/* Navigation par sections (scroll horizontal) */}
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                <TouchableOpacity 
                  style={{ 
                    paddingHorizontal: 16, 
                    paddingVertical: 8, 
                    backgroundColor: carteFoodSelectedSection === null ? primaryColor : '#f0f0f0',
                    borderRadius: 20,
                    marginRight: 8
                  }}
                  onPress={() => setCarteFoodSelectedSection(null)}
                >
                  <Text style={{ color: carteFoodSelectedSection === null ? '#fff' : '#666', fontWeight: '600', fontSize: 13 }}>Tout</Text>
                </TouchableOpacity>
                {carteFoodSections
                  .filter((s: any) => !s.parent_section_id && s.menu_type === carteFoodTab)
                  .map((section: any) => (
                    <TouchableOpacity 
                      key={section.section_id}
                      style={{ 
                        paddingHorizontal: 16, 
                        paddingVertical: 8, 
                        backgroundColor: carteFoodSelectedSection === section.section_id ? primaryColor : '#f0f0f0',
                        borderRadius: 20,
                        marginRight: 8
                      }}
                      onPress={() => setCarteFoodSelectedSection(section.section_id)}
                    >
                      <Text style={{ color: carteFoodSelectedSection === section.section_id ? '#fff' : '#666', fontWeight: '600', fontSize: 13 }}>{section.name}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
            
            {/* Liste des produits */}
            {isLoadingCarteFood ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={primaryColor} />
                <Text style={{ color: '#666', marginTop: 8 }}>Chargement...</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }}>
                {carteFoodSections
                  .filter((s: any) => !s.parent_section_id && s.menu_type === carteFoodTab)
                  .filter((s: any) => carteFoodSelectedSection === null || s.section_id === carteFoodSelectedSection)
                  .map((section: any) => {
                    let sectionItems = carteFoodItems.filter((i: any) => {
                      const matchesSection = i.section_id === section.section_id || 
                        carteFoodSections.some((sub: any) => sub.parent_section_id === section.section_id && sub.section_id === i.section_id);
                      const matchesSearch = !carteFoodSearchQuery || 
                        i.name.toLowerCase().includes(carteFoodSearchQuery.toLowerCase());
                      // Filtre allergènes: exclure les plats qui contiennent un allergène sélectionné
                      const hasExcludedAllergen = carteFoodAllergenFilter.length > 0 && 
                        i.allergens && i.allergens.some((a: string) => carteFoodAllergenFilter.includes(a));
                      return matchesSection && matchesSearch && !hasExcludedAllergen;
                    });
                    
                    if (sectionItems.length === 0) return null;
                    
                    return (
                      <View key={section.section_id} style={{ marginBottom: 8 }}>
                        {/* Header de section */}
                        <View style={{ backgroundColor: section.color || primaryColor, padding: 12, marginHorizontal: 16, marginTop: 8, borderRadius: 8 }}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{section.name}</Text>
                          {section.description && <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>{section.description}</Text>}
                        </View>
                        
                        {/* Items de la section */}
                        {sectionItems.map((item: any) => {
                          const hasMultiFormats = item.formats && item.formats.length > 1;
                          const singlePrice = item.formats?.length === 1 ? (item.formats[0].selling_price || item.formats[0].price) : item.price;
                          
                          return (
                            <TouchableOpacity 
                              key={item.item_id}
                              style={{ flexDirection: 'row', alignItems: 'center', padding: 14, marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                              onPress={() => selectFromCarteFood(item)}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: '600', color: '#333', fontSize: 15 }}>{item.name}</Text>
                                {item.descriptions?.[0] && (
                                  <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.descriptions[0]}</Text>
                                )}
                                {hasMultiFormats ? (
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                                    {item.formats.map((f: any, i: number) => (
                                      <Text key={i} style={{ color: '#9c27b0', fontSize: 11, marginRight: 10 }}>
                                        {f.name}: {(f.selling_price || f.price || 0).toFixed(2)}€
                                      </Text>
                                    ))}
                                  </View>
                                ) : singlePrice ? (
                                  <Text style={{ color: primaryColor, fontWeight: '600', fontSize: 14, marginTop: 4 }}>{singlePrice.toFixed(2)}€</Text>
                                ) : null}
                              </View>
                              <View style={{ backgroundColor: hasMultiFormats ? '#9c27b0' : primaryColor, borderRadius: 20, padding: 8 }}>
                                <WebIcon name="add" size={18} color="#fff" />
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                
                {/* Message si aucun résultat */}
                {carteFoodSections
                  .filter((s: any) => !s.parent_section_id && s.menu_type === carteFoodTab)
                  .filter((s: any) => carteFoodSelectedSection === null || s.section_id === carteFoodSelectedSection)
                  .every((section: any) => {
                    const sectionItems = carteFoodItems.filter((i: any) => {
                      const matchesSection = i.section_id === section.section_id;
                      const matchesSearch = !carteFoodSearchQuery || i.name.toLowerCase().includes(carteFoodSearchQuery.toLowerCase());
                      const hasExcludedAllergen = carteFoodAllergenFilter.length > 0 && i.allergens?.some((a: string) => carteFoodAllergenFilter.includes(a));
                      return matchesSection && matchesSearch && !hasExcludedAllergen;
                    });
                    return sectionItems.length === 0;
                  }) && (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <WebIcon name="search" size={48} color="#ccc" />
                    <Text style={{ color: '#999', marginTop: 12 }}>Aucun produit trouvé</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      
      {/* Modal filtre allergènes pour Carte Food */}
      <Modal visible={showCarteFoodAllergenModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 16, color: primaryColor }}>Exclure les plats contenant :</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ALLERGENS_LIST.map((allergen) => (
                <TouchableOpacity
                  key={allergen.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: carteFoodAllergenFilter.includes(allergen.id) ? '#c62828' : '#ddd',
                    backgroundColor: carteFoodAllergenFilter.includes(allergen.id) ? '#ffebee' : '#fff',
                  }}
                  onPress={() => {
                    if (carteFoodAllergenFilter.includes(allergen.id)) {
                      setCarteFoodAllergenFilter(carteFoodAllergenFilter.filter(a => a !== allergen.id));
                    } else {
                      setCarteFoodAllergenFilter([...carteFoodAllergenFilter, allergen.id]);
                    }
                  }}
                >
                  <Text style={{ fontSize: 14, color: carteFoodAllergenFilter.includes(allergen.id) ? '#c62828' : '#333' }}>
                    {allergen.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity 
              style={{ marginTop: 20, padding: 14, backgroundColor: primaryColor, borderRadius: 8 }}
              onPress={() => setShowCarteFoodAllergenModal(false)}
            >
              <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: '600' }}>Appliquer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Modal Sélection de Format/Taille pour produits multi-prix */}
      <Modal visible={!!showFormatSelector} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '85%', maxWidth: 350 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, marginBottom: 6 }}>
              Choisir le format
            </Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              {showFormatSelector?.item?.name}
            </Text>
            
            {/* Liste des formats disponibles */}
            <View style={{ gap: 10 }}>
              {showFormatSelector?.item?.formats?.map((format: any, idx: number) => (
                <TouchableOpacity 
                  key={idx}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: 14, 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#e0e0e0'
                  }}
                  onPress={() => selectFromCarteFoodWithFormat(
                    showFormatSelector.item, 
                    format, 
                    showFormatSelector.targetSectionId
                  )}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }}>{format.name}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: primaryColor }}>
                    {(format.selling_price || format.price || 0).toFixed(2)}€
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Bouton Annuler */}
            <TouchableOpacity 
              style={{ marginTop: 16, padding: 12, backgroundColor: '#eee', borderRadius: 8 }}
              onPress={() => setShowFormatSelector(null)}
            >
              <Text style={{ textAlign: 'center', color: '#666', fontWeight: '500' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Modal Add Item */}
      <Modal visible={!!showAddItem} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor, marginBottom: 16 }}>Nouveau plat</Text>
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} placeholder="Nom du plat" value={newItemName} onChangeText={setNewItemName} />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }} placeholder="Description (optionnel)" value={newItemDesc} onChangeText={setNewItemDesc} multiline />
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity style={{ flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 8, marginRight: 8 }} onPress={() => { setShowAddItem(null); setNewItemName(''); setNewItemDesc(''); }}>
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 14, backgroundColor: primaryColor, borderRadius: 8 }} onPress={() => showAddItem && addItem(showAddItem)}>
                <Text style={{ textAlign: 'center', color: secondaryColor, fontWeight: '600' }}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Edit Reservation - Pour modifier les sélections du client */}
      <Modal visible={!!editingReservation} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', display: 'flex', flexDirection: 'column' }}>
            {/* Header fixe */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor }}>Modifier la réservation</Text>
              <TouchableOpacity onPress={() => { setEditingReservation(null); setEditSelectedSections([]); setEditSelectedItems({}); setEditCustomOptions([]); setEditClientName(''); setEditClientSurname(''); setEditClientCompany(''); setEditClientEmail(''); setEditClientPhone(''); setEditClientAddressStreet(''); setEditClientAddressPostalCode(''); setEditClientAddressCity(''); }}>
                <WebIcon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {editingReservation && (
              <ScrollView 
                style={{ flex: 1, paddingHorizontal: 20, overflow: 'scroll' as any }} 
                contentContainerStyle={{ paddingVertical: 16, paddingBottom: 30 }}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {/* Section Informations Client */}
                <View style={{ backgroundColor: '#f8f9fa', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 12, fontSize: 14 }}>
                    Informations client
                  </Text>
                  <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                    <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff' }} placeholder="Nom *" value={editClientName} onChangeText={setEditClientName} />
                    <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' }} placeholder="Prénom *" value={editClientSurname} onChangeText={setEditClientSurname} />
                  </View>
                  <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#fff' }} placeholder="Société (optionnel)" value={editClientCompany} onChangeText={setEditClientCompany} />
                  <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                    <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff' }} placeholder="Email" value={editClientEmail} onChangeText={setEditClientEmail} keyboardType="email-address" />
                    <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' }} placeholder="Téléphone" value={editClientPhone} onChangeText={setEditClientPhone} keyboardType="phone-pad" />
                  </View>
                  <Text style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>Adresse (optionnel)</Text>
                  <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: '#fff' }} placeholder="Rue" value={editClientAddressStreet} onChangeText={setEditClientAddressStreet} />
                  <View style={{ flexDirection: 'row' }}>
                    <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff' }} placeholder="Code postal" value={editClientAddressPostalCode} onChangeText={setEditClientAddressPostalCode} keyboardType="numeric" />
                    <TextInput style={{ flex: 2, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' }} placeholder="Ville" value={editClientAddressCity} onChangeText={setEditClientAddressCity} />
                  </View>
                </View>
                
                {/* Crédit Client */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Crédit Client</Text>
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: editClientIsCreditClient ? '#fff3cd' : '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: editClientIsCreditClient ? '#ffc107' : '#ddd' }}
                    onPress={() => setEditClientIsCreditClient(!editClientIsCreditClient)}
                    data-testid="toggle-credit-client"
                  >
                    <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: editClientIsCreditClient ? '#ffc107' : '#999', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: editClientIsCreditClient ? '#ffc107' : 'transparent' }}>
                      {editClientIsCreditClient && <WebIcon name="checkmark" size={16} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: editClientIsCreditClient ? '#856404' : '#333' }}>
                        {editClientIsCreditClient ? 'Oui - Crédit Client' : 'Non - Paiement immédiat'}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        {editClientIsCreditClient ? 'Le client paiera plus tard (affiché sur proposition)' : 'Le client paie à la réservation'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
                
                <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 8, fontSize: 14 }}>
                  Sélectionnez les sections et plats à inclure :
                </Text>
                
                {/* Liste de TOUTES les sections disponibles */}
                {sections.map((section: MenuSection) => {
                  const isSectionSelected = editSelectedSections.includes(section.section_id);
                  const sectionItemsList = items.filter((item: MenuItem) => item.section_id === section.section_id);
                  const selectedItemsInSection = editSelectedItems[section.section_id] || [];
                  
                  return (
                    <View key={section.section_id} style={{ marginBottom: 12, backgroundColor: isSectionSelected ? `${primaryColor}10` : '#f9f9f9', borderRadius: 8, padding: 12 }}>
                      {/* Header de la section avec checkbox */}
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isSectionSelected ? 8 : 0 }}
                        onPress={() => toggleEditSection(section.section_id)}
                      >
                        <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: primaryColor, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: isSectionSelected ? primaryColor : 'transparent' }}>
                          {isSectionSelected && <WebIcon name="checkmark" size={16} color="#fff" />}
                        </View>
                        <Text style={{ fontWeight: '600', color: primaryColor, flex: 1 }}>{section.name}</Text>
                        <Text style={{ color: '#999', fontSize: 12 }}>
                          {selectedItemsInSection.length}/{sectionItemsList.length} plats
                        </Text>
                      </TouchableOpacity>
                      
                      {/* Items de la section (affichés seulement si la section est sélectionnée) */}
                      {isSectionSelected && sectionItemsList.map((item: MenuItem) => {
                        const isItemSelected = selectedItemsInSection.includes(item.item_id);
                        const itemQty = editResClientSelections[item.item_id] || 0;
                        
                        return (
                          <View key={item.item_id} style={{ marginLeft: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {/* Checkbox pour ajouter/supprimer l'item */}
                              <TouchableOpacity 
                                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                onPress={() => toggleEditItem(section.section_id, item.item_id)}
                              >
                                <View style={{ width: 20, height: 20, borderWidth: 2, borderColor: isItemSelected ? primaryColor : '#ccc', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: isItemSelected ? primaryColor : 'transparent' }}>
                                  {isItemSelected && <WebIcon name="checkmark" size={14} color="#fff" />}
                                </View>
                                <Text style={{ color: isItemSelected ? '#333' : '#999', flex: 1 }}>{item.name}</Text>
                              </TouchableOpacity>
                              
                              {/* Contrôle de quantité (seulement si l'item est sélectionné) */}
                              {isItemSelected && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <TouchableOpacity 
                                    style={{ width: 28, height: 28, backgroundColor: '#eee', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
                                    onPress={() => updateReservationItemQty(item.item_id, -1)}
                                  >
                                    <WebIcon name="remove" size={16} color="#333" />
                                  </TouchableOpacity>
                                  <Text style={{ width: 36, textAlign: 'center', fontSize: 14, fontWeight: '600' }}>
                                    {itemQty}
                                  </Text>
                                  <TouchableOpacity 
                                    style={{ width: 28, height: 28, backgroundColor: primaryColor, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
                                    onPress={() => updateReservationItemQty(item.item_id, 1)}
                                  >
                                    <WebIcon name="add" size={16} color={secondaryColor} />
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
                
                {/* Section Options supplémentaires */}
                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee', marginBottom: 20 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Options supplémentaires</Text>
                  <Text style={{ color: '#888', marginBottom: 10, fontSize: 12 }}>Privatisation, Anniversaire, etc.</Text>
                  
                  {editCustomOptions.map((option, index) => (
                    <View key={index} style={{ marginBottom: 12, padding: 10, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput 
                          style={{ flex: 2, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginRight: 6, fontSize: 13, backgroundColor: '#fff' }} 
                          placeholder="Ex: Privatisation" 
                          value={option.name} 
                          onChangeText={(val) => updateEditCustomOption(index, 'name', val)} 
                        />
                        <TouchableOpacity onPress={() => removeEditCustomOption(index)} style={{ padding: 6 }}>
                          <WebIcon name="trash-outline" size={18} color="#dc3545" />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>Prix unit. €</Text>
                          <TextInput 
                            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, fontSize: 13, backgroundColor: '#fff' }} 
                            placeholder="100" 
                            value={option.price} 
                            onChangeText={(val) => updateEditCustomOption(index, 'price', val)} 
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>Quantité</Text>
                          <TextInput 
                            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, fontSize: 13, backgroundColor: '#fff' }} 
                            placeholder="1" 
                            value={option.quantity} 
                            onChangeText={(val) => updateEditCustomOption(index, 'quantity', val)} 
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>TVA %</Text>
                          <View style={{ flexDirection: 'row' }}>
                            {['0', '10', '20'].map((rate) => (
                              <TouchableOpacity 
                                key={rate}
                                onPress={() => updateEditCustomOption(index, 'tva_rate', rate)}
                                style={{ 
                                  flex: 1, 
                                  padding: 8, 
                                  backgroundColor: option.tva_rate === rate ? primaryColor : '#fff',
                                  borderWidth: 1, 
                                  borderColor: option.tva_rate === rate ? primaryColor : '#ddd', 
                                  borderRadius: rate === '0' ? 6 : 0,
                                  borderTopLeftRadius: rate === '0' ? 6 : 0,
                                  borderBottomLeftRadius: rate === '0' ? 6 : 0,
                                  borderTopRightRadius: rate === '20' ? 6 : 0,
                                  borderBottomRightRadius: rate === '20' ? 6 : 0,
                                  marginLeft: rate !== '0' ? -1 : 0
                                }}
                              >
                                <Text style={{ textAlign: 'center', fontSize: 12, color: option.tva_rate === rate ? '#fff' : '#333' }}>{rate}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderWidth: 1, borderColor: primaryColor, borderRadius: 6, borderStyle: 'dashed', marginTop: 4 }}
                    onPress={addEditCustomOption}
                  >
                    <WebIcon name="add-circle-outline" size={18} color={primaryColor} />
                    <Text style={{ color: primaryColor, marginLeft: 6, fontWeight: '500', fontSize: 13 }}>Ajouter une option</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
            
            {/* Boutons fixes en bas */}
            <View style={{ flexDirection: 'row', padding: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <TouchableOpacity style={{ flex: 1, padding: 14, backgroundColor: '#eee', borderRadius: 8, marginRight: 8 }} onPress={() => { setEditingReservation(null); setEditSelectedSections([]); setEditSelectedItems({}); setEditCustomOptions([]); setEditClientName(''); setEditClientSurname(''); setEditClientCompany(''); setEditClientEmail(''); setEditClientPhone(''); setEditClientAddressStreet(''); setEditClientAddressPostalCode(''); setEditClientAddressCity(''); }}>
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 14, backgroundColor: primaryColor, borderRadius: 8 }} onPress={saveEditReservation}>
                <Text style={{ textAlign: 'center', color: secondaryColor, fontWeight: '600' }}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* ========== MODAL: PDF VIEWER PROPOSITION/FACTURE ========== */}
      <Modal visible={showResPdfViewer} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', width: '95%', maxWidth: 900, height: '90%', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: primaryColor, borderBottomWidth: 1, borderBottomColor: '#333' }}>
              <Text style={{ color: secondaryColor, fontSize: 18, fontWeight: 'bold' }}>
                Prévisuel PDF - {resPdfType === 'proposition' ? 'Proposition' : 'Facture'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  onPress={downloadResPdf}
                  style={{ backgroundColor: '#2E7D32', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                  data-testid="download-res-pdf-btn"
                >
                  <WebIcon name="download-outline" size={20} color="white" />
                  <Text style={{ color: 'white', fontWeight: '600', marginLeft: 8 }}>Télécharger</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={closeResPdfViewer}
                  style={{ backgroundColor: '#666', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                  data-testid="close-res-pdf-btn"
                >
                  <WebIcon name="close" size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>
            {/* PDF Viewer - Using object tag for better iOS compatibility */}
            <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
              {resPdfUrl ? (
                <View style={{ flex: 1 }}>
                  <object
                    data={resPdfUrl}
                    type="application/pdf"
                    style={{ width: '100%', height: '100%' }}
                  >
                    {/* Fallback for iOS Safari which doesn't support PDF in object/iframe */}
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                      <WebIcon name="document-text-outline" size={80} color={primaryColor} />
                      <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor, marginTop: 20, textAlign: 'center' }}>
                        {resPdfType === 'proposition' ? 'Proposition' : 'Facture'} prête
                      </Text>
                      <Text style={{ fontSize: 14, color: '#666', marginTop: 12, textAlign: 'center', paddingHorizontal: 20 }}>
                        La prévisualisation PDF n'est pas disponible sur cet appareil. Utilisez le bouton "Télécharger" pour voir le document.
                      </Text>
                      <TouchableOpacity 
                        onPress={downloadResPdf}
                        style={{ backgroundColor: '#2E7D32', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', marginTop: 24 }}
                      >
                        <WebIcon name="download-outline" size={24} color="white" />
                        <Text style={{ color: 'white', fontWeight: '600', marginLeft: 10, fontSize: 16 }}>Télécharger le PDF</Text>
                      </TouchableOpacity>
                    </View>
                  </object>
                </View>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <Text style={{ marginTop: 16, color: '#666' }}>Chargement du PDF...</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ==================== CREATE GROUP SCREEN ====================
function CreateGroupScreen({ sections, items, primaryColor, secondaryColor, apiRequest, onBack, restaurant }: any) {
  const [clientName, setClientName] = useState('');
  const [clientSurname, setClientSurname] = useState('');
  const [clientCompany, setClientCompany] = useState('');  // Société (optionnel)
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  // Adresse client (optionnel - pour facturation)
  const [clientAddressStreet, setClientAddressStreet] = useState('');
  const [clientAddressPostalCode, setClientAddressPostalCode] = useState('');
  const [clientAddressCity, setClientAddressCity] = useState('');
  const [isCreditClient, setIsCreditClient] = useState(false);
  const [numPeople, setNumPeople] = useState('');
  const [date, setDate] = useState(getTomorrowDate());
  const [time, setTime] = useState('19:00');
  const [pricePerPerson, setPricePerPerson] = useState('');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<{[key: string]: string[]}>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [isDirectInvoice, setIsDirectInvoice] = useState(false);  // True si pas de menu (facture directe)
  // Options personnalisées (Privatisation, Anniversaire, etc.) avec quantité et TVA
  const [customOptions, setCustomOptions] = useState<{name: string; price: string; quantity: string; tva_rate: string}[]>([]);
  // Espaces de privatisation
  const [privatisationSpaces, setPrivatisationSpaces] = useState<any[]>([]);
  const [selectedPrivatisationSpace, setSelectedPrivatisationSpace] = useState<string | null>(null);
  
  // Charger les espaces de privatisation
  useEffect(() => {
    const loadSpaces = async () => {
      try {
        const spaces = await apiRequest('/privatisation-spaces/list');
        setPrivatisationSpaces(spaces);
      } catch (e) {
        console.error('Erreur chargement espaces privatisation:', e);
      }
    };
    loadSpaces();
  }, []);
  
  const addCustomOption = () => {
    setCustomOptions(prev => [...prev, { name: '', price: '', quantity: '1', tva_rate: '20' }]);
  };
  
  const updateCustomOption = (index: number, field: 'name' | 'price' | 'quantity' | 'tva_rate', value: string) => {
    setCustomOptions(prev => prev.map((opt, i) => i === index ? { ...opt, [field]: value } : opt));
  };
  
  const removeCustomOption = (index: number) => {
    setCustomOptions(prev => prev.filter((_, i) => i !== index));
  };

  const toggleSection = (sectionId: string) => {
    setSelectedSections(prev => {
      if (prev.includes(sectionId)) {
        const newItems = { ...selectedItems };
        delete newItems[sectionId];
        setSelectedItems(newItems);
        return prev.filter(id => id !== sectionId);
      } else {
        return [...prev, sectionId];
      }
    });
  };
  
  // Calcul automatique du prix basé sur les sections sélectionnées
  useEffect(() => {
    const totalPrice = selectedSections.reduce((sum, sectionId) => {
      const section = sections.find((s: MenuSection) => s.section_id === sectionId);
      return sum + (section?.price || 0);
    }, 0);
    
    // Mettre à jour le prix seulement s'il y a des sections avec prix
    if (totalPrice > 0) {
      setPricePerPerson(totalPrice.toFixed(2));
    }
  }, [selectedSections, sections]);

  const toggleItem = (sectionId: string, itemId: string) => {
    setSelectedItems(prev => {
      const sectionItems = prev[sectionId] || [];
      if (sectionItems.includes(itemId)) {
        return { ...prev, [sectionId]: sectionItems.filter(id => id !== itemId) };
      } else {
        return { ...prev, [sectionId]: [...sectionItems, itemId] };
      }
    });
  };

  const createGroup = async () => {
    if (!clientName || !clientSurname || !numPeople || !date || !time) {
      showAlert('Erreur', 'Veuillez remplir les champs obligatoires');
      return;
    }
    
    // Préparer les options personnalisées (filtrer les vides)
    let validOptions = customOptions
      .filter(opt => opt.name.trim())
      .map(opt => ({ 
        name: opt.name.trim(), 
        price: opt.price ? parseFloat(opt.price) : null,
        quantity: opt.quantity ? parseInt(opt.quantity) : 1,
        tva_rate: opt.tva_rate ? parseFloat(opt.tva_rate) : 20
      }));
    
    // Ajouter l'espace de privatisation si sélectionné
    if (selectedPrivatisationSpace) {
      const space = privatisationSpaces.find(s => s.space_id === selectedPrivatisationSpace);
      if (space) {
        const numPeopleInt = parseInt(numPeople || '0');
        const isUnderMinimum = space.capacity_min && numPeopleInt > 0 && numPeopleInt < space.capacity_min;
        const privatisationPrice = isUnderMinimum && space.price_under_minimum ? space.price_under_minimum : 0;
        
        if (privatisationPrice > 0) {
          validOptions.push({
            name: `Privatisation ${space.name}`,
            price: privatisationPrice,
            quantity: 1,
            tva_rate: 20
          });
        }
      }
    }
    
    // Vérifier qu'il y a au moins un menu OU des options personnalisées OU une privatisation
    if (selectedSections.length === 0 && validOptions.length === 0) {
      showAlert('Erreur', 'Veuillez sélectionner au moins une section de menu OU ajouter des options personnalisées');
      return;
    }

    setIsCreating(true);
    try {
      const response = await apiRequest('/group-reservations/create', {
        method: 'POST',
        body: JSON.stringify({
          client_name: clientName,
          client_surname: clientSurname,
          client_company: clientCompany || null,
          client_email: clientEmail || null,
          client_phone: clientPhone || null,
          client_address_street: clientAddressStreet || null,
          client_address_postal_code: clientAddressPostalCode || null,
          client_address_city: clientAddressCity || null,
          is_credit_client: isCreditClient,
          num_people: parseInt(numPeople),
          date,
          time,
          selected_sections: selectedSections,
          selected_items: selectedItems,
          price_per_person: pricePerPerson ? parseFloat(pricePerPerson) : null,
          custom_options: validOptions.length > 0 ? validOptions : null
        })
      });
      
      // Si pas de menu sélectionné, c'est une facture directe (pas de lien client)
      if (!response.client_link) {
        setIsDirectInvoice(true);
        setCreatedLink('direct');  // Marker pour afficher l'écran de succès
        showAlert('Succès', 'Réservation créée ! Vous pouvez générer la facture directement.');
      } else {
        setCreatedLink(response.client_link);
        showAlert('Succès', 'Groupe créé ! Vous pouvez maintenant copier le lien pour le client.');
      }
    } catch (error: any) {
      showAlert('Erreur', error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const copyLink = async () => {
    if (createdLink && createdLink !== 'direct' && Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(createdLink);
        showAlert('Copié', 'Le lien a été copié dans le presse-papier');
      } catch (e) {
        showAlert('Lien', createdLink);
      }
    }
  };

  // Écran de succès après création
  if (createdLink) {
    // Cas facture directe (sans menu)
    if (isDirectInvoice) {
      return (
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <View style={{ backgroundColor: '#d4edda', padding: 20, borderRadius: 12, marginBottom: 20 }}>
            <WebIcon name="checkmark-circle" size={48} color="#155724" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#155724', textAlign: 'center', marginBottom: 8 }}>Réservation créée !</Text>
            <Text style={{ color: '#155724', textAlign: 'center' }}>{clientName} {clientSurname} - {numPeople} personnes</Text>
          </View>
          
          <View style={{ backgroundColor: '#fff3cd', padding: 16, borderRadius: 8, marginBottom: 20 }}>
            <Text style={{ color: '#856404', textAlign: 'center', fontWeight: '600' }}>Facture directe</Text>
            <Text style={{ color: '#856404', textAlign: 'center', marginTop: 4 }}>
              Cette réservation n'a pas de menu à sélectionner. Vous pouvez générer la facture directement depuis la liste des réservations.
            </Text>
          </View>
          
          <TouchableOpacity style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8 }} onPress={onBack}>
            <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: '600' }}>Retour aux réservations</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    
    // Cas avec menu (lien client)
    return (
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ backgroundColor: '#d4edda', padding: 20, borderRadius: 12, marginBottom: 20 }}>
          <WebIcon name="checkmark-circle" size={48} color="#155724" style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#155724', textAlign: 'center', marginBottom: 8 }}>Groupe créé avec succès !</Text>
          <Text style={{ color: '#155724', textAlign: 'center' }}>{clientName} {clientSurname} - {numPeople} personnes</Text>
        </View>
        
        <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Lien pour le client :</Text>
        <View style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <Text style={{ color: '#666', fontSize: 13 }} numberOfLines={2}>{createdLink}</Text>
        </View>
        
        <TouchableOpacity style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, marginBottom: 12 }} onPress={copyLink}>
          <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: '600' }}>Copier le lien</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={{ backgroundColor: '#eee', padding: 14, borderRadius: 8 }} onPress={onBack}>
          <Text style={{ color: '#666', textAlign: 'center' }}>Retour aux réservations</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
            <WebIcon name="arrow-back" size={24} color={primaryColor} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>Nouveau groupe</Text>
        </View>

        {/* Client Info */}
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Informations client</Text>
          <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Nom *" value={clientName} onChangeText={setClientName} />
          <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Prénom *" value={clientSurname} onChangeText={setClientSurname} />
          <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Société (optionnel)" value={clientCompany} onChangeText={setClientCompany} />
          <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Email *" value={clientEmail} onChangeText={setClientEmail} keyboardType="email-address" />
          <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Téléphone *" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
          
          {/* Adresse client (optionnel - pour facturation) */}
          <Text style={{ color: '#888', fontSize: 12, marginTop: 8, marginBottom: 8 }}>Adresse (optionnel - pour facturation)</Text>
          <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Rue" value={clientAddressStreet} onChangeText={setClientAddressStreet} />
          <View style={{ flexDirection: 'row', marginBottom: 10 }}>
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, maxWidth: 120 }} placeholder="Code postal" value={clientAddressPostalCode} onChangeText={setClientAddressPostalCode} keyboardType="numeric" />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flex: 1 }} placeholder="Ville" value={clientAddressCity} onChangeText={setClientAddressCity} />
          </View>
          
          {/* Crédit Client */}
          <TouchableOpacity 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: 12, 
              backgroundColor: isCreditClient ? '#fff3cd' : '#f8f9fa', 
              borderRadius: 8, 
              borderWidth: 1, 
              borderColor: isCreditClient ? '#ffc107' : '#ddd',
              marginTop: 8
            }}
            onPress={() => setIsCreditClient(!isCreditClient)}
            data-testid="toggle-credit-client-create"
          >
            <View style={{ 
              width: 24, 
              height: 24, 
              borderWidth: 2, 
              borderColor: isCreditClient ? '#ffc107' : '#999', 
              borderRadius: 4, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12, 
              backgroundColor: isCreditClient ? '#ffc107' : 'transparent' 
            }}>
              {isCreditClient && <WebIcon name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: isCreditClient ? '#856404' : '#333' }}>
                Crédit Client
              </Text>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {isCreditClient ? 'Le client paiera plus tard' : 'Paiement immédiat'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Reservation Details */}
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Détails réservation</Text>
          <View style={{ flexDirection: 'row', marginBottom: 10 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: '#666', marginBottom: 4 }}>Nb personnes *</Text>
              <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 }} placeholder="10" value={numPeople} onChangeText={setNumPeople} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#666', marginBottom: 4 }}>Prix/pers (€) {selectedSections.length > 0 ? '(auto)' : ''}</Text>
              <TextInput 
                style={{ 
                  borderWidth: 1, 
                  borderColor: '#ddd', 
                  borderRadius: 8, 
                  padding: 12,
                  backgroundColor: selectedSections.some((sid: string) => sections.find((s: MenuSection) => s.section_id === sid && s.price)) ? '#e8f5e9' : '#fff'
                }} 
                placeholder="45" 
                value={pricePerPerson} 
                onChangeText={setPricePerPerson} 
                keyboardType="decimal-pad" 
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ marginRight: 8, maxWidth: 160 }}>
              <Text style={{ color: '#666', marginBottom: 4 }}>Date *</Text>
              <input
                type="date"
                value={date}
                onChange={(e: any) => setDate(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: 12, 
                  fontSize: 16,
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  boxSizing: 'border-box'
                }}
              />
            </View>
            <View style={{ maxWidth: 110 }}>
              <Text style={{ color: '#666', marginBottom: 4 }}>Heure *</Text>
              <input
                type="time"
                value={time}
                onChange={(e: any) => setTime(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: 12, 
                  fontSize: 16,
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  boxSizing: 'border-box'
                }}
              />
            </View>
          </View>
        </View>

        {/* Select Sections & Items - Organisation hiérarchique */}
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Sélection du menu</Text>
          <Text style={{ color: '#666', marginBottom: 16, fontSize: 13 }}>Cochez les formules à proposer au client</Text>
          
          {/* Grouper par sections parents (Entrées, Plats, Desserts) */}
          {sections
            .filter((s: MenuSection) => !s.parent_section_id)
            .sort((a: MenuSection, b: MenuSection) => (a.order || 0) - (b.order || 0))
            .map((parentSection: MenuSection) => {
              // Trouver les sous-sections de ce parent
              const subSections = sections
                .filter((s: MenuSection) => s.parent_section_id === parentSection.section_id)
                .sort((a: MenuSection, b: MenuSection) => (a.order || 0) - (b.order || 0));
              
              // Ne pas afficher la section parent si elle n'a pas de sous-sections avec prix
              if (subSections.length === 0) return null;
              
              return (
                <View key={parentSection.section_id} style={{ marginBottom: 20 }}>
                  {/* Titre de la section parent - NON SÉLECTIONNABLE */}
                  <View style={{ backgroundColor: `${primaryColor}15`, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: primaryColor, textTransform: 'uppercase' }}>{parentSection.name}</Text>
                  </View>
                  
                  {/* Sous-sections sélectionnables */}
                  {subSections.map((section: MenuSection) => (
                    <View key={section.section_id} style={{ marginBottom: 8, marginLeft: 8 }}>
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: selectedSections.includes(section.section_id) ? '#28a745' : '#ddd' }}
                        onPress={() => toggleSection(section.section_id)}
                      >
                        <WebIcon 
                          name={selectedSections.includes(section.section_id) ? 'checkbox' : 'square-outline'} 
                          size={24} 
                          color={selectedSections.includes(section.section_id) ? '#28a745' : primaryColor} 
                        />
                        <Text style={{ fontSize: 15, fontWeight: '500', color: selectedSections.includes(section.section_id) ? '#28a745' : '#333', marginLeft: 12, flex: 1 }}>{section.name}</Text>
                        {section.price != null && (
                          <View style={{ backgroundColor: selectedSections.includes(section.section_id) ? '#28a745' : '#6c757d', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{section.price.toFixed(2)}€</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      
                      {/* Items de cette sous-section - TOUJOURS VISIBLES */}
                      <View style={{ marginLeft: 44, marginTop: 8, backgroundColor: selectedSections.includes(section.section_id) ? '#e8f5e9' : '#f9f9f9', borderRadius: 8, padding: 12 }}>
                        {items.filter((item: MenuItem) => item.section_id === section.section_id).length > 0 ? (
                          <>
                            <Text style={{ fontSize: 11, color: '#888', marginBottom: 8, fontStyle: 'italic' }}>Composition :</Text>
                            {items.filter((item: MenuItem) => item.section_id === section.section_id).map((item: MenuItem) => (
                              <TouchableOpacity 
                                key={item.item_id}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                                onPress={() => toggleItem(section.section_id, item.item_id)}
                                disabled={!selectedSections.includes(section.section_id)}
                              >
                                <WebIcon 
                                  name={(selectedItems[section.section_id] || []).includes(item.item_id) ? 'checkbox' : 'square-outline'} 
                                  size={20} 
                                  color={selectedSections.includes(section.section_id) ? '#28a745' : '#ccc'} 
                                />
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                  <Text style={{ color: selectedSections.includes(section.section_id) ? '#333' : '#888' }}>{item.name}</Text>
                                  {item.description && <Text style={{ color: '#999', fontSize: 12 }}>{item.description}</Text>}
                                </View>
                              </TouchableOpacity>
                            ))}
                          </>
                        ) : (
                          <Text style={{ color: '#999', fontSize: 12, fontStyle: 'italic' }}>Aucun plat dans cette formule</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}

          {sections.length === 0 && (
            <Text style={{ color: '#999', textAlign: 'center', padding: 20 }}>Aucune section créée. Créez d'abord des sections dans "Formules".</Text>
          )}
        </View>

        {/* Options personnalisées */}
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Options supplémentaires</Text>
          <Text style={{ color: '#666', marginBottom: 12, fontSize: 13 }}>Ajoutez des options payantes (Privatisation, Anniversaire, etc.)</Text>
          
          {customOptions.map((option, index) => (
            <View key={index} style={{ marginBottom: 12, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TextInput 
                  style={{ flex: 2, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8, backgroundColor: '#fff' }} 
                  placeholder="Ex: Privatisation" 
                  value={option.name} 
                  onChangeText={(val) => updateCustomOption(index, 'name', val)} 
                />
                <TouchableOpacity onPress={() => removeCustomOption(index)} style={{ padding: 8 }}>
                  <WebIcon name="trash-outline" size={20} color="#dc3545" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Prix unit. €</Text>
                  <TextInput 
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' }} 
                    placeholder="100" 
                    value={option.price} 
                    onChangeText={(val) => updateCustomOption(index, 'price', val)} 
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Quantité</Text>
                  <TextInput 
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' }} 
                    placeholder="1" 
                    value={option.quantity} 
                    onChangeText={(val) => updateCustomOption(index, 'quantity', val)} 
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>TVA %</Text>
                  <View style={{ flexDirection: 'row' }}>
                    {['0', '10', '20'].map((rate) => (
                      <TouchableOpacity 
                        key={rate}
                        onPress={() => updateCustomOption(index, 'tva_rate', rate)}
                        style={{ 
                          flex: 1, 
                          padding: 10, 
                          backgroundColor: option.tva_rate === rate ? primaryColor : '#fff',
                          borderWidth: 1, 
                          borderColor: option.tva_rate === rate ? primaryColor : '#ddd', 
                          borderTopLeftRadius: rate === '0' ? 8 : 0,
                          borderBottomLeftRadius: rate === '0' ? 8 : 0,
                          borderTopRightRadius: rate === '20' ? 8 : 0,
                          borderBottomRightRadius: rate === '20' ? 8 : 0,
                          marginLeft: rate !== '0' ? -1 : 0
                        }}
                      >
                        <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '500', color: option.tva_rate === rate ? '#fff' : '#333' }}>{rate}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          ))}
          
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderWidth: 1, borderColor: primaryColor, borderRadius: 8, borderStyle: 'dashed' }}
            onPress={addCustomOption}
          >
            <WebIcon name="add-circle-outline" size={20} color={primaryColor} />
            <Text style={{ color: primaryColor, marginLeft: 8, fontWeight: '500' }}>Ajouter une option</Text>
          </TouchableOpacity>
        </View>

        {/* Espace de privatisation */}
        {privatisationSpaces.length > 0 && (
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Espace de privatisation</Text>
            <Text style={{ color: '#666', marginBottom: 12, fontSize: 13 }}>Sélectionnez un espace pour cet événement</Text>
            
            {privatisationSpaces.map((space: any) => {
              const numPeopleInt = parseInt(numPeople || '0');
              const isUnderMinimum = space.capacity_min && numPeopleInt > 0 && numPeopleInt < space.capacity_min;
              const privatisationPrice = isUnderMinimum && space.price_under_minimum ? space.price_under_minimum : 0;
              const isSelected = selectedPrivatisationSpace === space.space_id;
              
              return (
                <TouchableOpacity 
                  key={space.space_id}
                  style={{ 
                    padding: 12, 
                    borderWidth: 2, 
                    borderColor: isSelected ? primaryColor : '#eee', 
                    borderRadius: 8, 
                    marginBottom: 8,
                    backgroundColor: isSelected ? `${primaryColor}10` : 'transparent'
                  }}
                  onPress={() => setSelectedPrivatisationSpace(isSelected ? null : space.space_id)}
                  data-testid={`privatisation-space-${space.space_id}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: primaryColor, marginRight: 12, backgroundColor: isSelected ? primaryColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {isSelected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: secondaryColor }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: primaryColor }}>{space.name}</Text>
                        {privatisationPrice > 0 && (
                          <View style={{ backgroundColor: '#ff9800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{privatisationPrice.toFixed(0)}€</Text>
                          </View>
                        )}
                      </View>
                      {(space.capacity_min || space.capacity_max) && (
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                          Capacité: {space.capacity_min && `${space.capacity_min}`}{space.capacity_min && space.capacity_max && ' - '}{space.capacity_max && `${space.capacity_max}`} personnes
                        </Text>
                      )}
                      {isUnderMinimum && privatisationPrice > 0 && (
                        <Text style={{ fontSize: 11, color: '#ff6b35', marginTop: 4, fontStyle: 'italic' }}>
                          Privatisation payante (moins de {space.capacity_min} personnes)
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Create Button */}
        <TouchableOpacity 
          style={{ backgroundColor: primaryColor, padding: 16, borderRadius: 8, marginBottom: 32 }}
          onPress={createGroup}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color={secondaryColor} />
          ) : (
            <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: '600', fontSize: 16 }}>Créer le groupe et générer le lien</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ==================== CLIENT MENU SELECTION SCREEN (Public) ====================
function ClientMenuSelectionScreen(_props: any) { return null as any; }

// ==================== PUBLIC GROUP REQUEST SCREEN (Formulaire public de demande de réservation) ====================

// ==================== STAFF GROUP VIEW SCREEN (Vue staff après scan QR) ====================
function StaffGroupViewScreen({ 
  token, 
  onClose, 
  primaryColor, 
  secondaryColor,
  apiRequest
}: { 
  token: string; 
  onClose: () => void;
  primaryColor: string;
  secondaryColor: string;
  apiRequest: (url: string, options?: any) => Promise<any>;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [sendingToZelty, setSendingToZelty] = useState(false);
  const [sentToZelty, setSentToZelty] = useState(false);

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Charger les données du groupe via l'API publique
      const response = await fetch(`${API_URL}/public/group/${token}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Groupe non trouvé');
      }
      const result = await response.json();
      setData(result);
      
      // Les items du menu sont déjà dans result.items (avec zelty_id)
      setMenuItems(result.items || []);
      
      // Vérifier si déjà envoyé à Zelty
      if (result.reservation?.zelty_order_id) {
        setSentToZelty(true);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement');
    } finally {
      setIsLoading(false);
    }
  };

  // Envoyer à la caisse Zelty
  const sendToZelty = async () => {
    const reservation = data?.reservation;
    if (!reservation?.client_selections || Object.keys(reservation.client_selections).length === 0) {
      showAlert('Erreur', 'Aucune sélection client à envoyer');
      return;
    }
    
    setSendingToZelty(true);
    
    try {
      // Construire la liste des items avec leur zelty_id
      const zeltyItems: any[] = [];
      let itemsWithoutZeltyId: string[] = [];
      
      Object.entries(reservation.client_selections).forEach(([itemId, selection]) => {
        const menuItem = menuItems.find((mi: any) => mi.item_id === itemId);
        if (menuItem) {
          // Gérer les deux formats: ancien {itemId: number} et nouveau {itemId: {quantity, cooking_option}}
          const quantity = typeof selection === 'number' ? selection : (selection as any).quantity;
          const cookingOption = typeof selection === 'object' ? (selection as any).cooking_option : null;
          
          if (menuItem.zelty_id) {
            zeltyItems.push({
              zelty_id: menuItem.zelty_id,
              quantity: quantity,
              name: menuItem.name,
              cooking_option: cookingOption,
              notes: null
            });
          } else {
            itemsWithoutZeltyId.push(menuItem.name);
          }
        }
      });
      
      if (zeltyItems.length === 0) {
        showAlert('Erreur', `Aucun produit n'a d'ID Zelty configuré.\n\nPlats sans ID Zelty:\n${itemsWithoutZeltyId.join('\n')}\n\nAllez dans Menu Restaurant > Modifier le plat > ID Zelty pour configurer.`);
        setSendingToZelty(false);
        return;
      }
      
      // Envoyer à Zelty
      try {
        const response = await apiRequest('/zelty/send-order', {
          method: 'POST',
          body: JSON.stringify({
            reservation_id: reservation.reservation_id,
            table_number: reservation.table_number || '1',
            customer_name: `${reservation.client_name} ${reservation.client_surname || ''}`.trim(),
            items: zeltyItems,
            notes: reservation.notes || null
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          let message = `✅ Commande envoyée à la caisse !\n\n${result.items_count} produit(s) envoyé(s)`;
          if (itemsWithoutZeltyId.length > 0) {
            message += `\n\n⚠️ Non envoyés (sans ID Zelty):\n${itemsWithoutZeltyId.join('\n')}`;
          }
          showAlert('Succès', message);
          setSentToZelty(true);
        } else {
          showAlert('Erreur Zelty', result.detail || "Erreur lors de l'envoi à la caisse");
        }
      } catch (apiError: any) {
        // Si erreur d'authentification, demander de se connecter
        if (apiError.message?.includes('Not authenticated') || apiError.message?.includes('401')) {
          showAlert('Connexion requise', 'Veuillez vous connecter à l\'application pour envoyer la commande à la caisse.');
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Erreur envoi Zelty:', error);
      showAlert('Erreur', error.message || "Impossible d'envoyer à la caisse");
    }
    
    setSendingToZelty(false);
  };

  // Calculer les totaux des sélections client
  const getSelectionsSummary = () => {
    const selections = data?.reservation?.client_selections || {};
    const items = data?.items || [];
    const summary: {name: string; quantity: number; cooking_option?: string}[] = [];
    
    Object.entries(selections).forEach(([itemId, selection]) => {
      const item = items.find((i: any) => i.item_id === itemId);
      if (item) {
        const quantity = typeof selection === 'number' ? selection : (selection as any).quantity;
        const cookingOption = typeof selection === 'object' ? (selection as any).cooking_option : null;
        summary.push({ name: item.name, quantity, cooking_option: cookingOption });
      }
    });
    
    return summary;
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

  if (error) {
    return (
      <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <WebIcon name="alert-circle-outline" size={64} color={secondaryColor} />
          <Text style={{ color: secondaryColor, fontSize: 18, marginTop: 16, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity 
            style={{ marginTop: 24, padding: 14, backgroundColor: secondaryColor, borderRadius: 8 }} 
            onPress={onClose}
          >
            <Text style={{ color: primaryColor, fontWeight: '600' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaWrapper>
    );
  }

  const reservation = data?.reservation;
  const restaurant = data?.restaurant;
  const selectionsSummary = getSelectionsSummary();
  const hasSelections = selectionsSummary.length > 0;

  return (
    <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: secondaryColor + '30' }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 16 }}>
          <WebIcon name="arrow-back" size={24} color={secondaryColor} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: secondaryColor }}>Gestion Commande</Text>
          <Text style={{ fontSize: 14, color: secondaryColor, opacity: 0.8 }}>{restaurant?.name}</Text>
        </View>
        <WebIcon name="restaurant" size={28} color={secondaryColor} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          
          {/* Informations client */}
          <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <WebIcon name="person" size={22} color={primaryColor} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginLeft: 10 }}>
                {reservation?.client_name} {reservation?.client_surname}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 8 }}>
                <WebIcon name="calendar" size={16} color={primaryColor} />
                <Text style={{ color: primaryColor, marginLeft: 6 }}>{reservation?.date}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 8 }}>
                <WebIcon name="time" size={16} color={primaryColor} />
                <Text style={{ color: primaryColor, marginLeft: 6 }}>{reservation?.time}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <WebIcon name="people" size={16} color={primaryColor} />
                <Text style={{ color: primaryColor, marginLeft: 6 }}>{reservation?.num_people} pers.</Text>
              </View>
            </View>
            {reservation?.table_number && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                <WebIcon name="grid" size={16} color={primaryColor} />
                <Text style={{ color: primaryColor, marginLeft: 6, fontWeight: '600' }}>Table {reservation.table_number}</Text>
              </View>
            )}
          </View>

          {/* Statut */}
          <View style={{ 
            backgroundColor: reservation?.status === 'client_submitted' ? '#d4edda' : '#fff3cd', 
            borderRadius: 8, 
            padding: 12, 
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <WebIcon 
              name={reservation?.status === 'client_submitted' ? 'checkmark-circle' : 'time-outline'} 
              size={20} 
              color={reservation?.status === 'client_submitted' ? '#28a745' : '#856404'} 
            />
            <Text style={{ 
              marginLeft: 8, 
              fontWeight: '600', 
              color: reservation?.status === 'client_submitted' ? '#155724' : '#856404' 
            }}>
              {reservation?.status === 'client_submitted' ? 'Client a validé sa sélection' : 'En attente de validation client'}
            </Text>
          </View>

          {/* Sélections du client */}
          {hasSelections ? (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: secondaryColor, marginBottom: 12 }}>
                Sélections du client ({selectionsSummary.reduce((sum, s) => sum + s.quantity, 0)} plats)
              </Text>
              
              {selectionsSummary.map((sel, index) => (
                <View key={index} style={{ 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: 8, 
                  padding: 12, 
                  marginBottom: 8, 
                  flexDirection: 'row', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '500', color: '#333' }}>{sel.name}</Text>
                    {sel.cooking_option && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <WebIcon name="flame" size={14} color="#e67e22" />
                        <Text style={{ fontSize: 13, color: '#e67e22', marginLeft: 4 }}>{sel.cooking_option}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ 
                    backgroundColor: primaryColor, 
                    paddingHorizontal: 12, 
                    paddingVertical: 6, 
                    borderRadius: 16 
                  }}>
                    <Text style={{ color: secondaryColor, fontWeight: 'bold' }}>x{sel.quantity}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ 
              backgroundColor: '#fff3cd', 
              borderRadius: 8, 
              padding: 16, 
              marginBottom: 20, 
              alignItems: 'center' 
            }}>
              <WebIcon name="hourglass-outline" size={32} color="#856404" />
              <Text style={{ color: '#856404', marginTop: 8, textAlign: 'center' }}>
                Le client n'a pas encore fait de sélection
              </Text>
            </View>
          )}

          {/* Bouton Envoyer à Zelty */}
          {hasSelections && !sentToZelty && (
            <TouchableOpacity
              style={{ 
                backgroundColor: sendingToZelty ? '#6c757d' : '#17a2b8', 
                borderRadius: 12, 
                padding: 16, 
                flexDirection: 'row', 
                justifyContent: 'center', 
                alignItems: 'center',
                marginBottom: 16
              }}
              onPress={sendToZelty}
              disabled={sendingToZelty}
              data-testid="send-to-zelty-btn"
            >
              {sendingToZelty ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <WebIcon name="restaurant-outline" size={22} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 10 }}>
                    Envoyer à la caisse Zelty
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Badge si déjà envoyé */}
          {sentToZelty && (
            <View style={{ 
              backgroundColor: '#d4edda', 
              borderRadius: 12, 
              padding: 16, 
              flexDirection: 'row', 
              justifyContent: 'center', 
              alignItems: 'center',
              marginBottom: 16
            }}>
              <WebIcon name="checkmark-circle" size={22} color="#28a745" />
              <Text style={{ color: '#28a745', fontWeight: '700', fontSize: 16, marginLeft: 10 }}>
                Commande envoyée à la caisse
              </Text>
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaWrapper>
  );
}

function PublicGroupRequestScreen({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [privatisationSpaces, setPrivatisationSpaces] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [trackingLink, setTrackingLink] = useState<string | null>(null);
  
  // Form fields
  const [clientName, setClientName] = useState('');
  const [clientSurname, setClientSurname] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [preferredDate, setPreferredDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // Date par défaut : dans 7 jours
    return d.toISOString().split('T')[0];
  });
  const [preferredTime, setPreferredTime] = useState('19:00');
  const [message, setMessage] = useState('');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<{option_id: string; option_name: string; quantity: number; free_text: string}[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [showSpaceInfo, setShowSpaceInfo] = useState<any>(null);

  useEffect(() => {
    loadFormData();
  }, [restaurantId]);

  const loadFormData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Charger les données du formulaire et les espaces de privatisation
      const [formResponse, spacesResponse] = await Promise.all([
        fetch(`${API_URL}/public/restaurant/${restaurantId}/group-form`),
        fetch(`${API_URL}/public/restaurant/${restaurantId}/privatisation-spaces`)
      ]);
      
      if (!formResponse.ok) {
        const err = await formResponse.json();
        throw new Error(err.detail || 'Restaurant non trouvé');
      }
      const result = await formResponse.json();
      setData(result);
      
      if (spacesResponse.ok) {
        const spaces = await spacesResponse.json();
        setPrivatisationSpaces(spaces);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setSelectedSections(prev => 
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
    );
  };

  const toggleOption = (option: any) => {
    setSelectedOptions(prev => {
      const exists = prev.find(o => o.option_id === option.option_id);
      if (exists) {
        return prev.filter(o => o.option_id !== option.option_id);
      }
      return [...prev, { option_id: option.option_id, option_name: option.name, quantity: 1, free_text: '' }];
    });
  };

  const updateOptionQuantity = (optionId: string, change: number) => {
    setSelectedOptions(prev => prev.map(o => 
      o.option_id === optionId ? { ...o, quantity: Math.max(1, o.quantity + change) } : o
    ));
  };

  const updateOptionFreeText = (optionId: string, text: string) => {
    setSelectedOptions(prev => prev.map(o => 
      o.option_id === optionId ? { ...o, free_text: text } : o
    ));
  };

  const calculateEstimatedPrice = () => {
    const sections = data?.sections || [];
    return selectedSections.reduce((sum, sectionId) => {
      const section = sections.find((s: any) => s.section_id === sectionId);
      return sum + (section?.price || 0);
    }, 0);
  };

  const submitRequest = async () => {
    if (!clientName || !clientSurname || !clientEmail || !numPeople) {
      showAlert('Erreur', 'Veuillez remplir les champs obligatoires (Nom, Prénom, Email, Nombre de personnes)');
      return;
    }
    if (selectedSections.length === 0) {
      showAlert('Erreur', 'Veuillez sélectionner au moins une formule');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/public/restaurant/${restaurantId}/group-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          client_surname: clientSurname,
          client_company: clientCompany || null,
          client_email: clientEmail,
          client_phone: clientPhone || null,
          num_people: parseInt(numPeople),
          preferred_date: preferredDate || null,
          preferred_time: preferredTime || null,
          selected_sections: selectedSections,
          selected_options: selectedOptions,
          message: message || null
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Erreur lors de l\'envoi');
      }

      const result = await response.json();
      setTrackingLink(result.tracking_link);
      setSubmitted(true);
    } catch (err: any) {
      showAlert('Erreur', err.message || 'Erreur lors de l\'envoi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const primaryColor = data?.restaurant?.primary_color || DEFAULT_PRIMARY;
  const secondaryColor = data?.restaurant?.secondary_color || DEFAULT_SECONDARY;

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

  if (error) {
    return (
      <SafeAreaWrapper backgroundColor={DEFAULT_PRIMARY} style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <WebIcon name="alert-circle-outline" size={64} color={DEFAULT_SECONDARY} />
          <Text style={{ color: DEFAULT_SECONDARY, fontSize: 18, marginTop: 16, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={{ marginTop: 24, padding: 14, backgroundColor: DEFAULT_SECONDARY, borderRadius: 8 }} onPress={onClose}>
            <Text style={{ color: DEFAULT_PRIMARY, fontWeight: '600' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaWrapper>
    );
  }

  if (submitted) {
    return (
      <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <WebIcon name="checkmark-circle" size={80} color="#4CAF50" />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: secondaryColor, marginTop: 20, textAlign: 'center' }}>
            Demande envoyée !
          </Text>
          <Text style={{ fontSize: 16, color: secondaryColor, opacity: 0.8, marginTop: 12, textAlign: 'center' }}>
            Le restaurant va traiter votre demande et vous recevrez une proposition.
          </Text>
          <View style={{ backgroundColor: secondaryColor, borderRadius: 12, padding: 20, marginTop: 32, width: '100%' }}>
            <Text style={{ fontWeight: '600', color: primaryColor, fontSize: 16, marginBottom: 8 }}>Récapitulatif :</Text>
            <Text style={{ color: primaryColor }}>Client : {clientName} {clientSurname}</Text>
            <Text style={{ color: primaryColor }}>Personnes : {numPeople}</Text>
            <Text style={{ color: primaryColor }}>Estimation : {calculateEstimatedPrice().toFixed(2)}€/pers</Text>
          </View>
          {trackingLink && (
            <TouchableOpacity 
              style={{ marginTop: 24, padding: 14, backgroundColor: secondaryColor, borderRadius: 8 }}
              onPress={() => {
                if (Platform.OS === 'web') {
                  navigator.clipboard.writeText(trackingLink);
                  showAlert('Copié', 'Le lien de suivi a été copié');
                }
              }}
            >
              <Text style={{ color: primaryColor, fontWeight: '600' }}>Copier le lien de suivi</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaWrapper>
    );
  }

  const sections = data?.sections || [];
  const options = data?.options || [];
  const restaurant = data?.restaurant;

  return (
    <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
      <StatusBar style="light" />
      
      <View style={{ padding: 16, alignItems: 'center' }}>
        {restaurant?.logo_base64 && (
          <Image source={{ uri: `data:image/png;base64,${restaurant.logo_base64}` }} style={{ width: 60, height: 60, marginBottom: 8 }} resizeMode="contain" />
        )}
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: secondaryColor }}>{restaurant?.name}</Text>
        <Text style={{ color: secondaryColor, opacity: 0.8, marginTop: 4 }}>Réservation de groupe</Text>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <View style={{ padding: 16 }}>
          {/* Informations client */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Vos informations</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Nom *" value={clientName} onChangeText={setClientName} />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Prénom *" value={clientSurname} onChangeText={setClientSurname} />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Société (optionnel)" value={clientCompany} onChangeText={setClientCompany} />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Email *" value={clientEmail} onChangeText={setClientEmail} keyboardType="email-address" />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Téléphone *" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
            <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Nombre de personnes *" value={numPeople} onChangeText={setNumPeople} keyboardType="numeric" />
              <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                {Platform.OS === 'web' ? (
                  <>
                    <View style={{ flex: 1, marginRight: 8, maxWidth: 180 }}>
                      <input 
                        type="date" 
                        value={preferredDate} 
                        onChange={(e: any) => setPreferredDate(e.target.value)}
                        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }}
                        data-testid="public-date-input"
                      />
                    </View>
                    <View style={{ width: 110 }}>
                      <input 
                        type="time" 
                        value={preferredTime} 
                        onChange={(e: any) => setPreferredTime(e.target.value)}
                        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }}
                        data-testid="public-time-input"
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, maxWidth: 180 }} placeholder="Date (AAAA-MM-JJ)" value={preferredDate} onChangeText={setPreferredDate} />
                    <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, width: 110 }} placeholder="Heure" value={preferredTime} onChangeText={setPreferredTime} />
                  </>
                )}
              </View>
          </View>

          {/* Sélection des formules - Structure hiérarchique */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Choisissez vos formules</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            {sections.map((parentSection: any) => {
              const subSections = parentSection.sub_sections || [];
              const hasSubSections = subSections.length > 0;
              
              return (
                <View key={parentSection.section_id} style={{ marginBottom: 16 }}>
                  {/* Titre de la section parent (Entrées, Plats, Desserts) */}
                  <View style={{ backgroundColor: primaryColor, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: secondaryColor }}>{parentSection.name}</Text>
                    {parentSection.description && (
                      <Text style={{ fontSize: 12, color: secondaryColor, opacity: 0.8, marginTop: 2 }}>{parentSection.description}</Text>
                    )}
                  </View>
                  
                  {/* Sous-sections (Entrée 1, Entrée 2, etc.) */}
                  {hasSubSections ? (
                    subSections.map((subSection: any) => {
                      const isSelected = selectedSections.includes(subSection.section_id);
                      const subItems = subSection.items || [];
                      return (
                        <View key={subSection.section_id} style={{ borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 8, marginLeft: 8 }}>
                          {/* Ligne de sélection de sous-section */}
                          <TouchableOpacity 
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}
                            onPress={() => toggleSection(subSection.section_id)}
                          >
                            <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: primaryColor, marginRight: 12, backgroundColor: isSelected ? primaryColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                              {isSelected && <WebIcon name="checkmark" size={16} color={secondaryColor} />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '500', color: primaryColor }}>{subSection.name}</Text>
                              {subSection.description && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{subSection.description}</Text>}
                            </View>
                            {subSection.price ? (
                              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor }}>{subSection.price.toFixed(2)}€</Text>
                            ) : null}
                          </TouchableOpacity>
                          
                          {/* Items de la sous-section - TOUJOURS VISIBLES */}
                          {subItems.length > 0 && (
                            <View style={{ paddingLeft: 48, paddingRight: 12, paddingBottom: 12, backgroundColor: isSelected ? `${primaryColor}08` : '#f9f9f9', borderRadius: 8, marginHorizontal: 8, marginBottom: 8 }}>
                              <Text style={{ fontSize: 12, color: '#666', marginBottom: 8, fontStyle: 'italic' }}>Composition :</Text>
                              {subItems.map((item: any, idx: number) => (
                                <View key={item.item_id || idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSelected ? primaryColor : '#999', marginTop: 6, marginRight: 10 }} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, color: isSelected ? '#333' : '#666' }}>{item.name}</Text>
                                    {item.description && <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{item.description}</Text>}
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    /* Si pas de sous-sections, afficher les items directement dans la section parent */
                    (parentSection.items || []).length > 0 && (
                      <View style={{ paddingLeft: 16, paddingRight: 12, paddingBottom: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginHorizontal: 8, marginBottom: 8 }}>
                        {(parentSection.items || []).map((item: any, idx: number) => (
                          <View key={item.item_id || idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#999', marginTop: 6, marginRight: 10 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, color: '#666' }}>{item.name}</Text>
                              {item.description && <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{item.description}</Text>}
                            </View>
                          </View>
                        ))}
                      </View>
                    )
                  )}
                </View>
              );
            })}
            {selectedSections.length > 0 && numPeople && (
              <View style={{ marginTop: 12, padding: 12, backgroundColor: `${primaryColor}10`, borderRadius: 8 }}>
                <Text style={{ fontSize: 14, color: primaryColor }}>Estimation : <Text style={{ fontWeight: '600' }}>{calculateEstimatedPrice().toFixed(2)}€/pers</Text></Text>
                <Text style={{ fontSize: 16, color: primaryColor, fontWeight: '700', marginTop: 4 }}>Total estimé : {(calculateEstimatedPrice() * parseInt(numPeople || '0')).toFixed(2)}€</Text>
              </View>
            )}
          </View>

          {/* Espaces de privatisation */}
          {privatisationSpaces.length > 0 && (
            <>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Espace de privatisation</Text>
              <Text style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Sélectionnez un espace pour votre événement</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                {privatisationSpaces.map((space: any) => {
                  const numPeopleInt = parseInt(numPeople || '0');
                  const isUnderMinimum = space.capacity_min && numPeopleInt > 0 && numPeopleInt < space.capacity_min;
                  const showPriceWarning = isUnderMinimum && space.price_under_minimum;
                  
                  return (
                    <TouchableOpacity 
                      key={space.space_id}
                      style={{ 
                        padding: 12, 
                        borderWidth: 2, 
                        borderColor: selectedSpace === space.space_id ? primaryColor : '#eee', 
                        borderRadius: 8, 
                        marginBottom: 8,
                        backgroundColor: selectedSpace === space.space_id ? `${primaryColor}10` : 'transparent'
                      }}
                      onPress={() => setSelectedSpace(selectedSpace === space.space_id ? null : space.space_id)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: primaryColor, marginRight: 12, backgroundColor: selectedSpace === space.space_id ? primaryColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedSpace === space.space_id && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: secondaryColor }} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor }}>{space.name}</Text>
                            {showPriceWarning && (
                              <View style={{ backgroundColor: '#ff9800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{space.price_under_minimum.toFixed(0)}€</Text>
                              </View>
                            )}
                          </View>
                          {(space.capacity_min || space.capacity_max) && (
                            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                              Capacité: {space.capacity_min && `${space.capacity_min}`}{space.capacity_min && space.capacity_max && ' - '}{space.capacity_max && `${space.capacity_max}`} personnes
                            </Text>
                          )}
                          {space.photos?.length > 0 && (
                            <Text style={{ fontSize: 11, color: '#9c27b0', marginTop: 2 }}>📷 {space.photos.length} photo(s) - cliquez sur ℹ️ pour voir</Text>
                          )}
                          {showPriceWarning && (
                            <Text style={{ fontSize: 11, color: '#ff6b35', marginTop: 4, fontStyle: 'italic' }}>
                              Privatisation payante si moins de {space.capacity_min} personnes
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity 
                          style={{ padding: 8, backgroundColor: '#f0f0f0', borderRadius: 8, marginLeft: 8 }}
                          onPress={(e) => { e.stopPropagation(); setShowSpaceInfo(space); }}
                        >
                          <WebIcon name="information-circle-outline" size={20} color={primaryColor} />
                        </TouchableOpacity>
                      </View>
                      {space.description && selectedSpace === space.space_id && (
                        <Text style={{ color: '#666', fontSize: 13, marginTop: 8, marginLeft: 36 }}>{space.description}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Options supplémentaires */}
          {options.length > 0 && (
            <>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Options supplémentaires</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                {options.map((option: any) => {
                  const selected = selectedOptions.find(o => o.option_id === option.option_id);
                  const optionPrice = option.price || 0;
                  const totalOptionPrice = selected ? optionPrice * selected.quantity : 0;
                  return (
                    <View key={option.option_id} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => toggleOption(option)}>
                        <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: primaryColor, marginRight: 12, backgroundColor: selected ? primaryColor : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {selected && <WebIcon name="checkmark" size={16} color={secondaryColor} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: primaryColor }}>{option.name}</Text>
                            {optionPrice > 0 && (
                              <Text style={{ fontSize: 15, fontWeight: '600', color: primaryColor }}>{optionPrice.toFixed(0)}€</Text>
                            )}
                          </View>
                          {option.description && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{option.description}</Text>}
                        </View>
                      </TouchableOpacity>
                      {selected && (
                        <View style={{ marginTop: 8, marginLeft: 36 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={{ fontSize: 13, color: '#666', marginRight: 8 }}>Quantité :</Text>
                            <TouchableOpacity style={{ padding: 4 }} onPress={() => updateOptionQuantity(option.option_id, -1)}>
                              <WebIcon name="remove-circle-outline" size={24} color={primaryColor} />
                            </TouchableOpacity>
                            <Text style={{ fontSize: 16, fontWeight: '600', marginHorizontal: 12 }}>{selected.quantity}</Text>
                            <TouchableOpacity style={{ padding: 4 }} onPress={() => updateOptionQuantity(option.option_id, 1)}>
                              <WebIcon name="add-circle-outline" size={24} color={primaryColor} />
                            </TouchableOpacity>
                            {totalOptionPrice > 0 && (
                              <Text style={{ fontSize: 14, fontWeight: '600', color: primaryColor, marginLeft: 12 }}>
                                = {totalOptionPrice.toFixed(0)}€
                              </Text>
                            )}
                          </View>
                          {option.is_free_text && (
                            <TextInput 
                              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 }}
                              placeholder="Précisez votre demande..."
                              value={selected.free_text}
                              onChangeText={(text) => updateOptionFreeText(option.option_id, text)}
                              multiline
                            />
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Message */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Message (optionnel)</Text>
          <TextInput 
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, minHeight: 100, textAlignVertical: 'top', marginBottom: 80 }}
            placeholder="Une demande particulière ?"
            value={message}
            onChangeText={setMessage}
            multiline
          />
        </View>
      </ScrollView>

      {/* Submit button */}
      <View style={{ padding: 16, backgroundColor: secondaryColor, borderTopWidth: 1, borderTopColor: '#eee' }}>
        <TouchableOpacity 
          style={{ backgroundColor: primaryColor, padding: 16, borderRadius: 12, alignItems: 'center' }}
          onPress={submitRequest}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={secondaryColor} />
          ) : (
            <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 16 }}>Envoyer ma demande</Text>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Modal Info Espace de Privatisation */}
      <Modal visible={!!showSpaceInfo} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor }}>{showSpaceInfo?.name}</Text>
              <TouchableOpacity onPress={() => setShowSpaceInfo(null)}>
                <WebIcon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              {/* Photos de l'espace */}
              {showSpaceInfo?.photos?.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Photos de l'espace ({showSpaceInfo.photos.length})</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {showSpaceInfo.photos.map((photo: string, index: number) => {
                      const photoUrl = photo.startsWith('http') || photo.startsWith('data:') 
                        ? photo 
                        : `data:image/jpeg;base64,${photo}`;
                      return (
                        <View key={index} style={{ width: 140, height: 105, borderRadius: 8, overflow: 'hidden', backgroundColor: '#e0e0e0' }}>
                          <div 
                            style={{ 
                              width: '100%', 
                              height: '100%', 
                              backgroundImage: `url(${photoUrl})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              borderRadius: 8
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
              
              {/* Description */}
              {showSpaceInfo?.description && (
                <Text style={{ color: '#333', marginBottom: 16, lineHeight: 22 }}>{showSpaceInfo.description}</Text>
              )}
              
              {/* Capacité */}
              {(showSpaceInfo?.capacity_min || showSpaceInfo?.capacity_max) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <WebIcon name="people-outline" size={20} color={primaryColor} />
                  <Text style={{ marginLeft: 8, color: '#333' }}>
                    Capacité: {showSpaceInfo.capacity_min && `${showSpaceInfo.capacity_min}`}{showSpaceInfo.capacity_min && showSpaceInfo.capacity_max && ' - '}{showSpaceInfo.capacity_max && `${showSpaceInfo.capacity_max}`} personnes
                  </Text>
                </View>
              )}
              
              {/* Équipements */}
              {showSpaceInfo?.amenities?.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Équipements disponibles</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {showSpaceInfo.amenities.map((amenity: string, index: number) => (
                      <View key={index} style={{ backgroundColor: `${primaryColor}15`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                        <Text style={{ color: primaryColor, fontSize: 13 }}>{amenity}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              {/* Info prix */}
              {showSpaceInfo?.price_info && (
                <View style={{ backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginTop: 8 }}>
                  <Text style={{ color: '#666', fontSize: 13 }}>{showSpaceInfo.price_info}</Text>
                </View>
              )}
            </ScrollView>
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, alignItems: 'center' }}
                onPress={() => { setSelectedSpace(showSpaceInfo?.space_id); setShowSpaceInfo(null); }}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>Sélectionner cet espace</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaWrapper>
  );
}

// ==================== TRACK GROUP RESERVATION SCREEN (Suivi de réservation par le client) ====================
function TrackGroupReservationScreen({ token, onClose }: { token: string; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isResponding, setIsResponding] = useState(false);

  useEffect(() => {
    loadTrackingData();
  }, [token]);

  const loadTrackingData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/public/track/${token}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Réservation non trouvée');
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement');
    } finally {
      setIsLoading(false);
    }
  };

  const respondToProposal = async (accepted: boolean) => {
    setIsResponding(true);
    try {
      const response = await fetch(`${API_URL}/public/track/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted, rejection_reason: !accepted ? rejectionReason : null })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Erreur lors de la réponse');
      }
      await loadTrackingData();
      setShowResponseModal(false);
      showAlert(accepted ? 'Merci !' : 'Réponse envoyée', accepted ? 'Votre réservation est confirmée.' : 'Le restaurant va revoir la proposition.');
    } catch (err: any) {
      showAlert('Erreur', err.message);
    } finally {
      setIsResponding(false);
    }
  };

  const primaryColor = data?.restaurant?.primary_color || DEFAULT_PRIMARY;
  const secondaryColor = data?.restaurant?.secondary_color || DEFAULT_SECONDARY;

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

  if (error) {
    return (
      <SafeAreaWrapper backgroundColor={DEFAULT_PRIMARY} style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <WebIcon name="alert-circle-outline" size={64} color={DEFAULT_SECONDARY} />
          <Text style={{ color: DEFAULT_SECONDARY, fontSize: 18, marginTop: 16, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={{ marginTop: 24, padding: 14, backgroundColor: DEFAULT_SECONDARY, borderRadius: 8 }} onPress={onClose}>
            <Text style={{ color: DEFAULT_PRIMARY, fontWeight: '600' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaWrapper>
    );
  }

  const reservation = data?.reservation;
  const restaurant = data?.restaurant;
  const sections = data?.sections || [];

  const getStatusInfo = () => {
    const status = reservation?.status;
    const proposalStatus = reservation?.proposal_status;
    
    if (status === 'request_pending') return { icon: 'time-outline', color: '#FFA500', text: 'Demande en cours de traitement' };
    if (status === 'proposal_sent') return { icon: 'document-text-outline', color: '#2196F3', text: 'Proposition reçue - En attente de votre réponse' };
    if (status === 'accepted') return { icon: 'checkmark-circle', color: '#4CAF50', text: 'Réservation confirmée' };
    if (status === 'rejected') return { icon: 'close-circle', color: '#f44336', text: 'Proposition refusée - Le restaurant va faire une nouvelle proposition' };
    if (proposalStatus === 'to_invoice') return { icon: 'receipt-outline', color: '#9C27B0', text: 'En cours de facturation' };
    if (proposalStatus === 'invoiced') return { icon: 'document-outline', color: '#4CAF50', text: 'Facturé' };
    if (proposalStatus === 'paid') return { icon: 'checkmark-done-circle', color: '#4CAF50', text: 'Payé - Merci !' };
    return { icon: 'help-circle-outline', color: '#666', text: 'Statut inconnu' };
  };

  const statusInfo = getStatusInfo();

  return (
    <SafeAreaWrapper backgroundColor={primaryColor} style={styles.container}>
      <StatusBar style="light" />
      
      <View style={{ padding: 16, alignItems: 'center' }}>
        {restaurant?.logo_base64 && (
          <Image source={{ uri: `data:image/png;base64,${restaurant.logo_base64}` }} style={{ width: 60, height: 60, marginBottom: 8 }} resizeMode="contain" />
        )}
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: secondaryColor }}>{restaurant?.name}</Text>
        <Text style={{ color: secondaryColor, opacity: 0.8, marginTop: 4 }}>Suivi de votre réservation</Text>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: secondaryColor, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <View style={{ padding: 16 }}>
          {/* Status */}
          <View style={{ backgroundColor: `${statusInfo.color}15`, borderRadius: 12, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
            <WebIcon name={statusInfo.icon as any} size={32} color={statusInfo.color} />
            <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: '500', color: statusInfo.color, flex: 1 }}>{statusInfo.text}</Text>
          </View>

          {/* Reservation details */}
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Détails de la réservation</Text>
            <Text style={{ color: '#333', marginBottom: 4 }}>Client : {reservation?.client_name} {reservation?.client_surname}</Text>
            <Text style={{ color: '#333', marginBottom: 4 }}>Personnes : {reservation?.num_people}</Text>
            {reservation?.date && <Text style={{ color: '#333', marginBottom: 4 }}>Date : {reservation?.date} {reservation?.time && `à ${reservation?.time}`}</Text>}
            {reservation?.price_per_person && (
              <Text style={{ color: '#333', marginBottom: 4 }}>Prix/pers : {reservation?.price_per_person.toFixed(2)}€</Text>
            )}
            {reservation?.price_per_person && reservation?.num_people && (
              <Text style={{ color: primaryColor, fontWeight: '600', marginTop: 8 }}>
                Total : {(reservation?.price_per_person * reservation?.num_people).toFixed(2)}€
              </Text>
            )}
          </View>

          {/* Selected sections */}
          {sections.length > 0 && (
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Formules sélectionnées</Text>
              {sections.map((section: any) => (
                <View key={section.section_id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ color: '#333' }}>{section.name}</Text>
                  {section.price && <Text style={{ fontWeight: '600', color: primaryColor }}>{section.price.toFixed(2)}€</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Options (if any) */}
          {reservation?.custom_options?.length > 0 && (
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Options</Text>
              {reservation.custom_options.map((opt: any, index: number) => (
                <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ color: '#333' }}>{opt.name} {opt.quantity > 1 && `x${opt.quantity}`}</Text>
                  {opt.price && <Text style={{ fontWeight: '600', color: primaryColor }}>{(opt.price * (opt.quantity || 1)).toFixed(2)}€</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Action buttons for proposal_sent status */}
          {reservation?.status === 'proposal_sent' && (
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity 
                style={{ backgroundColor: '#4CAF50', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 8 }}
                onPress={() => respondToProposal(true)}
                disabled={isResponding}
              >
                {isResponding ? <ActivityIndicator color="white" /> : (
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Accepter la proposition</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ backgroundColor: '#f44336', padding: 16, borderRadius: 12, alignItems: 'center' }}
                onPress={() => setShowResponseModal(true)}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Refuser et expliquer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Contact info */}
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 80 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 8 }}>Contact restaurant</Text>
            {restaurant?.phone && <Text style={{ color: '#333', marginBottom: 4 }}>Tél : {restaurant.phone}</Text>}
            {restaurant?.email && <Text style={{ color: '#333' }}>Email : {restaurant.email}</Text>}
          </View>
        </View>
      </ScrollView>

      {/* Rejection Modal */}
      <Modal visible={showResponseModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor, marginBottom: 16 }}>Pourquoi refusez-vous ?</Text>
            <TextInput 
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 }}
              placeholder="Le plat ne me convient pas, le prix est trop élevé..."
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
            />
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 8, marginRight: 8, backgroundColor: '#eee' }} onPress={() => setShowResponseModal(false)}>
                <Text style={{ textAlign: 'center', color: '#666' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f44336' }}
                onPress={() => respondToProposal(false)}
                disabled={isResponding}
              >
                {isResponding ? <ActivityIndicator color="white" /> : <Text style={{ textAlign: 'center', color: 'white', fontWeight: '600' }}>Envoyer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaWrapper>
  );
}

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
function OrderPreparationScreen(_props: any) { return null as any; }

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

function EventsScreen({ 
  events, selectedEvent, setSelectedEvent, providers, tasks, menuSections, menuItems, 
  pricePackages, drinkOptions, users, prestataires, primaryColor, secondaryColor, apiRequest, 
  loadEvents, loadEventData, loadPrestataires, allRestaurants, restaurant, setShowRestaurantPicker,
  isAdmin, userPermissions
}: EventsScreenProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'providers' | 'tasks' | 'menu'>('providers');
  const [eventForm, setEventForm] = useState({ title: '', date: '', description: '', notes: '', assigned_team: [] as string[] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // PDF Preview states
  const [showEventPdfPreview, setShowEventPdfPreview] = useState(false);
  const [eventPdfUrl, setEventPdfUrl] = useState<string | null>(null);
  
  // Permissions helpers
  const eventPerms = userPermissions?.evenement || userPermissions?.evenements || {};
  
  const canAddSection = isAdmin || eventPerms?.menu_section?.ajouter;
  const canEditSection = isAdmin || eventPerms?.menu_section?.modifier;
  const canDeleteSection = isAdmin || eventPerms?.menu_section?.supprimer;
  const canAddPlat = isAdmin || eventPerms?.menu_plats?.ajouter;
  const canEditPlat = isAdmin || eventPerms?.menu_plats?.modifier;
  const canDeletePlat = isAdmin || eventPerms?.menu_plats?.supprimer;
  const canAddPackage = isAdmin || eventPerms?.menu_packages?.ajouter;
  const canEditPackage = isAdmin || eventPerms?.menu_packages?.modifier;
  const canDeletePackage = isAdmin || eventPerms?.menu_packages?.supprimer;
  const canAddTask = isAdmin || eventPerms?.taches?.ajouter;
  const canEditTask = isAdmin || eventPerms?.taches?.modifier;
  const canDeleteTask = isAdmin || eventPerms?.taches?.supprimer;
  const canAddPrestataire = isAdmin || eventPerms?.prestataires?.ajouter;
  const canEditPrestataire = isAdmin || eventPerms?.prestataires?.modifier;
  const canDeletePrestataire = isAdmin || eventPerms?.prestataires?.supprimer;
  const canGenerateProposition = isAdmin || eventPerms?.proposition_generer;
  const canGenerateFacture = isAdmin || eventPerms?.facture_generer;
  
  // Archive mode
  const [showArchives, setShowArchives] = useState(false);
  const [archivedEvents, setArchivedEvents] = useState<any[]>([]);

  // Provider modals
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [providerForm, setProviderForm] = useState({ name: '', contact_name: '', phone: '', email: '', notes: '', start_time: '', end_time: '', price: '' });
  const [providerInputMode, setProviderInputMode] = useState<'select' | 'manual'>('select'); // Mode de saisie
  const [selectedPrestataireId, setSelectedPrestataireId] = useState<string>(''); // Prestataire sélectionné

  // Task modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_date: '', assigned_user_id: '' });

  // Menu modals
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState<any>(null);
  const [sectionForm, setSectionForm] = useState({ name: '', color: '#3498db' });
  
  // Predefined colors for sections and items
  const sectionColors = [
    { name: 'Bleu', value: '#3498db' },
    { name: 'Vert', value: '#27ae60' },
    { name: 'Orange', value: '#e67e22' },
    { name: 'Rouge', value: '#e74c3c' },
    { name: 'Violet', value: '#9b59b6' },
    { name: 'Rose', value: '#e91e63' },
    { name: 'Turquoise', value: '#1abc9c' },
    { name: 'Jaune', value: '#f1c40f' },
    { name: 'Gris', value: '#7f8c8d' },
    { name: 'Marron', value: '#795548' },
  ];
  
  // Auto-assign color based on section name
  const getDefaultColorForSection = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('entrée') || lowerName.includes('entree')) return '#27ae60'; // Vert
    if (lowerName.includes('plat') || lowerName.includes('principal')) return '#8e44ad'; // Violet
    if (lowerName.includes('dessert')) return '#e67e22'; // Orange
    if (lowerName.includes('boisson') || lowerName.includes('drink')) return '#3498db'; // Bleu
    if (lowerName.includes('fromage')) return '#f1c40f'; // Jaune
    if (lowerName.includes('accompagnement')) return '#1abc9c'; // Turquoise
    return '#3498db'; // Bleu par défaut
  };

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState({ name: '', description: '', section_id: '', price: '' });

  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [packageForm, setPackageForm] = useState({ name: '', section_ids: [] as string[], price: '' });

  const [showDrinkModal, setShowDrinkModal] = useState(false);
  const [editingDrink, setEditingDrink] = useState<any>(null);
  const [drinkForm, setDrinkForm] = useState({ name: '', price: '' });

  // Invoice status modal
  const [showInvoiceStatusModal, setShowInvoiceStatusModal] = useState(false);
  const [selectedProviderForInvoice, setSelectedProviderForInvoice] = useState<any>(null);
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  
  // File upload states
  const [uploadingFile, setUploadingFile] = useState<{ providerId: string; fileType: string } | null>(null);
  
  // Get the session token from props (we need to pass it through)
  const getSessionToken = async () => {
    const token = await AsyncStorage.getItem('session_token');
    return token;
  };

  const formatEventDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const createEvent = async () => {
    if (!eventForm.title || !eventForm.date) { alert('Titre et date requis'); return; }
    setIsSubmitting(true);
    try {
      await apiRequest('/events', { method: 'POST', body: JSON.stringify(eventForm) });
      setShowCreateModal(false);
      setEventForm({ title: '', date: '', description: '', notes: '', assigned_team: [] });
      loadEvents();
    } catch (error) { alert('Erreur création événement'); }
    setIsSubmitting(false);
  };

  const updateEvent = async () => {
    if (!selectedEvent) return;
    setIsSubmitting(true);
    try {
      await apiRequest(`/events/${selectedEvent.event_id}`, { method: 'PUT', body: JSON.stringify(eventForm) });
      setShowEditModal(false);
      loadEvents();
      const updatedEvent = await apiRequest(`/events/${selectedEvent.event_id}`);
      setSelectedEvent(updatedEvent);
    } catch (error) { alert('Erreur modification événement'); }
    setIsSubmitting(false);
  };

  const deleteEvent = async (eventId: string) => {
    if (!(await showConfirm('Supprimer cet événement ?'))) return;
    try {
      await apiRequest(`/events/${eventId}`, { method: 'DELETE' });
      loadEvents();
      setSelectedEvent(null);
    } catch (error) { alert('Erreur suppression événement'); }
  };

  const duplicateEvent = async (eventId: string) => {
    try {
      const result = await apiRequest(`/events/${eventId}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
      alert(`Événement dupliqué ! ${result.duplicated.providers} prestataires, ${result.duplicated.tasks} tâches, ${result.duplicated.menu_sections} sections copiées.`);
      loadEvents();
    } catch (error) { alert('Erreur duplication événement'); }
  };

  // Archive functions
  const loadArchivedEvents = async () => {
    try {
      const data = await apiRequest('/events/archived');
      setArchivedEvents(data);
    } catch (error) { console.error('Error loading archived events:', error); }
  };

  const archiveEvent = async (eventId: string) => {
    if (!(await showConfirm('Archiver cet événement ?'))) return;
    try {
      await apiRequest(`/events/${eventId}/archive`, { method: 'POST' });
      loadEvents();
      alert('Événement archivé !');
    } catch (error) { alert('Erreur archivage événement'); }
  };

  const restoreEvent = async (eventId: string) => {
    if (!(await showConfirm('Restaurer cet événement ?'))) return;
    try {
      await apiRequest(`/events/${eventId}/restore`, { method: 'POST' });
      loadArchivedEvents();
      loadEvents();
      alert('Événement restauré !');
    } catch (error) { alert('Erreur restauration événement'); }
  };

  // Provider functions
  const saveProvider = async () => {
    if (!providerForm.name) { alert('Nom requis'); return; }
    setIsSubmitting(true);
    try {
      if (editingProvider) {
        await apiRequest(`/events/${selectedEvent.event_id}/providers/${editingProvider.provider_id}`, { method: 'PUT', body: JSON.stringify(providerForm) });
      } else {
        await apiRequest(`/events/${selectedEvent.event_id}/providers`, { method: 'POST', body: JSON.stringify(providerForm) });
      }
      setShowProviderModal(false);
      setEditingProvider(null);
      setProviderForm({ name: '', contact_name: '', phone: '', email: '', notes: '', start_time: '', end_time: '', price: '' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur sauvegarde prestataire'); }
    setIsSubmitting(false);
  };

  const deleteProvider = async (providerId: string) => {
    if (!(await showConfirm('Supprimer ce prestataire ?'))) return;
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/providers/${providerId}`, { method: 'DELETE' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur suppression prestataire'); }
  };

  const validateQuote = async (providerId: string, validated: boolean) => {
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/providers/${providerId}/validate-quote`, { method: 'POST', body: JSON.stringify({ validated }) });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur validation devis'); }
  };

  const updateProviderInvoiceStatus = async () => {
    if (!selectedProviderForInvoice) return;
    if (invoiceStatus === 'paid' && !paymentMethod) { alert('Méthode de paiement requise'); return; }
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/providers/${selectedProviderForInvoice.provider_id}/invoice-status`, { 
        method: 'POST', 
        body: JSON.stringify({ status: invoiceStatus, payment_method: invoiceStatus === 'paid' ? paymentMethod : null }) 
      });
      setShowInvoiceStatusModal(false);
      setSelectedProviderForInvoice(null);
      setInvoiceStatus('');
      setPaymentMethod('');
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur mise à jour statut facture'); }
  };

  // File upload functions
  const uploadProviderFile = async (providerId: string, fileType: 'quote' | 'invoice' | 'payment_proof') => {
    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = fileType === 'payment_proof' ? 'image/*,.pdf' : '.pdf,application/pdf';
    
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setUploadingFile({ providerId, fileType });
      
      try {
        const token = await getSessionToken();
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/events/${selectedEvent.event_id}/providers/${providerId}/${fileType}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: 'Erreur serveur' }));
          throw new Error(errorData.detail || 'Erreur upload');
        }
        
        alert('Fichier uploadé avec succès !');
        loadEventData(selectedEvent.event_id);
      } catch (error: any) {
        alert('Erreur upload: ' + (error.message || 'Erreur inconnue'));
      } finally {
        setUploadingFile(null);
      }
    };
    
    input.click();
  };

  const downloadProviderFile = async (providerId: string, fileType: 'quote' | 'invoice' | 'payment_proof') => {
    try {
      const token = await getSessionToken();
      const response = await fetch(`${API_BASE_URL}/api/events/${selectedEvent.event_id}/providers/${providerId}/download/${fileType}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Fichier non trouvé' }));
        throw new Error(errorData.detail || 'Erreur téléchargement');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileType}_${providerId}.${fileType === 'payment_proof' ? 'jpg' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error: any) {
      alert('Erreur téléchargement: ' + (error.message || 'Fichier non disponible'));
    }
  };

  // Export Event Menu PDF - Télécharge directement via la fonction universelle PWA
  const exportEventMenuPDF = async () => {
    try {
      const token = await getSessionToken();
      const pdfUrl = `${API_BASE_URL}/api/events/${selectedEvent.event_id}/menu/export-pdf?token=${encodeURIComponent(token)}`;
      const filename = `menu_${selectedEvent.title.replace(/\s+/g, '_')}_${selectedEvent.date}.pdf`;
      await downloadOrShareFile(pdfUrl, filename, 'application/pdf');
    } catch (error: any) {
      console.error('PDF Error:', error);
      alert('Erreur lors du téléchargement du PDF: ' + (error.message || 'Erreur inconnue'));
    }
  };
  
  // Download Event PDF from preview (utilise la fonction universelle PWA)
  const downloadEventPdfFromPreview = async () => {
    if (eventPdfUrl) {
      const filename = `menu_${selectedEvent.title.replace(/\s+/g, '_')}_${selectedEvent.date}.pdf`;
      // eventPdfUrl est déjà un blob URL, on doit le reconvertir en blob
      try {
        const response = await fetch(eventPdfUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'application/pdf' });
        
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
          const shareData = { files: [file], title: filename };
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return;
          }
        }
        
        // Fallback
        const a = document.createElement('a');
        a.href = eventPdfUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (error) {
        const a = document.createElement('a');
        a.href = eventPdfUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  };
  
  // Close Event PDF Preview
  const closeEventPdfPreview = () => {
    if (eventPdfUrl) {
      window.URL.revokeObjectURL(eventPdfUrl);
    }
    setEventPdfUrl(null);
    setShowEventPdfPreview(false);
  };

  // Task functions
  const saveTask = async () => {
    if (!taskForm.title || !taskForm.due_date) { alert('Titre et deadline requis'); return; }
    setIsSubmitting(true);
    try {
      if (editingTask) {
        await apiRequest(`/events/${selectedEvent.event_id}/tasks/${editingTask.task_id}`, { method: 'PUT', body: JSON.stringify(taskForm) });
      } else {
        await apiRequest(`/events/${selectedEvent.event_id}/tasks`, { method: 'POST', body: JSON.stringify(taskForm) });
      }
      setShowTaskModal(false);
      setEditingTask(null);
      setTaskForm({ title: '', description: '', due_date: '', assigned_user_id: '' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur sauvegarde tâche'); }
    setIsSubmitting(false);
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/tasks/${taskId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur mise à jour statut'); }
  };

  const deleteTask = async (taskId: string) => {
    if (!(await showConfirm('Supprimer cette tâche ?'))) return;
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/tasks/${taskId}`, { method: 'DELETE' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur suppression tâche'); }
  };

  // Menu functions
  const saveSection = async () => {
    if (!sectionForm.name) { alert('Nom requis'); return; }
    setIsSubmitting(true);
    try {
      if (editingSection) {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/sections/${editingSection.section_id}`, { method: 'PUT', body: JSON.stringify(sectionForm) });
      } else {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/sections`, { method: 'POST', body: JSON.stringify(sectionForm) });
      }
      setShowSectionModal(false);
      setEditingSection(null);
      setSectionForm({ name: '', color: '#3498db' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur sauvegarde section'); }
    setIsSubmitting(false);
  };

  const saveItem = async () => {
    if (!itemForm.name || !itemForm.section_id) { alert('Nom et section requis'); return; }
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/items/${editingItem.item_id}`, { method: 'PUT', body: JSON.stringify(itemForm) });
      } else {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/items`, { method: 'POST', body: JSON.stringify(itemForm) });
      }
      setShowItemModal(false);
      setEditingItem(null);
      setItemForm({ name: '', description: '', section_id: '', price: '' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur sauvegarde plat'); }
    setIsSubmitting(false);
  };

  const savePackage = async () => {
    if (!packageForm.name || packageForm.section_ids.length === 0 || !packageForm.price) { alert('Nom, sections et prix requis'); return; }
    setIsSubmitting(true);
    try {
      // Handle comma as decimal separator (French format)
      const priceValue = parseFloat(packageForm.price.replace(',', '.'));
      const data = { ...packageForm, price: priceValue };
      if (editingPackage) {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/packages/${editingPackage.package_id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/packages`, { method: 'POST', body: JSON.stringify(data) });
      }
      setShowPackageModal(false);
      setEditingPackage(null);
      setPackageForm({ name: '', section_ids: [], price: '' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur sauvegarde package'); }
    setIsSubmitting(false);
  };

  const saveDrink = async () => {
    if (!drinkForm.name || !drinkForm.price) { alert('Nom et prix requis'); return; }
    setIsSubmitting(true);
    try {
      // Handle comma as decimal separator (French format)
      const priceValue = parseFloat(drinkForm.price.replace(',', '.'));
      const data = { ...drinkForm, price: priceValue };
      if (editingDrink) {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/drinks/${editingDrink.drink_id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await apiRequest(`/events/${selectedEvent.event_id}/menu/drinks`, { method: 'POST', body: JSON.stringify(data) });
      }
      setShowDrinkModal(false);
      setEditingDrink(null);
      setDrinkForm({ name: '', price: '' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur sauvegarde boisson'); }
    setIsSubmitting(false);
  };

  const toggleDrinkSelection = async (drink: any) => {
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/menu/drinks/${drink.drink_id}`, { method: 'PUT', body: JSON.stringify({ is_selected: !drink.is_selected }) });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur mise à jour sélection'); }
  };

  // Delete functions for Menu tab
  const deleteMenuSection = async (sectionId: string) => {
    if (!(await showConfirm('Supprimer cette section et tous ses plats ?'))) return;
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/menu/sections/${sectionId}`, { method: 'DELETE' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur suppression section'); }
  };

  const deleteMenuItem = async (itemId: string) => {
    if (!(await showConfirm('Supprimer ce plat ?'))) return;
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/menu/items/${itemId}`, { method: 'DELETE' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur suppression plat'); }
  };

  const deleteMenuPackage = async (packageId: string) => {
    if (!(await showConfirm('Supprimer ce package ?'))) return;
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/menu/packages/${packageId}`, { method: 'DELETE' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur suppression package'); }
  };

  const deleteMenuDrink = async (drinkId: string) => {
    if (!(await showConfirm('Supprimer cette boisson ?'))) return;
    try {
      await apiRequest(`/events/${selectedEvent.event_id}/menu/drinks/${drinkId}`, { method: 'DELETE' });
      loadEventData(selectedEvent.event_id);
    } catch (error) { alert('Erreur suppression boisson'); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return '#ff6b6b';
      case 'in_progress': return '#ffd93d';
      case 'completed': return '#6bcb77';
      default: return '#888';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'todo': return 'À faire';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminé';
      default: return status;
    }
  };

  const getQuoteStatusStyle = (status: string) => {
    return status === 'validated' ? { backgroundColor: '#6bcb77', color: '#fff' } : { backgroundColor: '#ffd93d', color: '#333' };
  };

  const getInvoiceStatusStyle = (status: string) => {
    switch (status) {
      case 'paid': return { backgroundColor: '#6bcb77', color: '#fff' };
      case 'awaiting_payment': return { backgroundColor: '#ffd93d', color: '#333' };
      default: return { backgroundColor: '#888', color: '#fff' };
    }
  };

  const getInvoiceStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Payée';
      case 'awaiting_payment': return 'En attente';
      default: return 'Non uploadée';
    }
  };

  // If no event selected, show list
  if (!selectedEvent) {
    // Show archived events view
    if (showArchives) {
      return (
        <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity 
              onPress={() => setShowArchives(false)}
              style={{ flexDirection: 'row', alignItems: 'center' }}
              data-testid="back-from-archives-btn"
            >
              <Text style={{ fontSize: 24, marginRight: 8 }}>←</Text>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>📦 Archives</Text>
            </TouchableOpacity>
          </View>

          {archivedEvents.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#888', marginTop: 40, fontSize: 16 }}>Aucun événement archivé</Text>
          ) : (
            archivedEvents.map(event => (
              <View 
                key={event.event_id}
                style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#888' }}
                data-testid={`archived-event-${event.event_id}`}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <TouchableOpacity 
                    style={{ flex: 1 }}
                    onPress={() => { setSelectedEvent(event); loadEventData(event.event_id); setShowArchives(false); }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#666' }}>{event.title}</Text>
                    <Text style={{ fontSize: 14, color: '#888' }}>📅 {formatEventDate(event.date)}</Text>
                    {event.description && <Text style={{ fontSize: 13, color: '#999', marginTop: 4 }}>{event.description}</Text>}
                    {event.auto_archived && <Text style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Archivé automatiquement</Text>}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                      onPress={() => restoreEvent(event.event_id)}
                      style={{ backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                      data-testid={`restore-event-${event.event_id}`}
                    >
                      <Text style={{ color: '#fff', fontSize: 13 }}>↩️ Restaurer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      );
    }

    // Show active events list
    return (
      <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>🎉 Événements</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity 
              style={{ backgroundColor: '#888', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
              onPress={() => { setShowArchives(true); loadArchivedEvents(); }}
              data-testid="show-archives-btn"
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>📦 Archives</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ backgroundColor: primaryColor, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}
              onPress={() => setShowCreateModal(true)}
              data-testid="create-event-btn"
            >
              <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 24 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {events.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#888', marginTop: 40, fontSize: 16 }}>Aucun événement. Créez votre premier événement !</Text>
        ) : (
          events.map(event => (
            <TouchableOpacity 
              key={event.event_id}
              style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
              onPress={() => { setSelectedEvent(event); loadEventData(event.event_id); }}
              data-testid={`event-item-${event.event_id}`}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 4 }}>{event.title}</Text>
                  <Text style={{ fontSize: 14, color: '#666' }}>📅 {formatEventDate(event.date)}</Text>
                  {event.description && <Text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{event.description}</Text>}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); archiveEvent(event.event_id); }}
                    style={{ padding: 8 }}
                    data-testid={`archive-event-${event.event_id}`}
                  >
                    <Text>📦</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); duplicateEvent(event.event_id); }}
                    style={{ padding: 8 }}
                    data-testid={`duplicate-event-${event.event_id}`}
                  >
                    <Text>📋</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); deleteEvent(event.event_id); }}
                    style={{ padding: 8 }}
                    data-testid={`delete-event-${event.event_id}`}
                  >
                    <Text>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Modal Création Événement */}
        <Modal visible={showCreateModal} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, overflow: 'hidden' }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>Nouvel événement</Text>
              <TextInput
                placeholder="Titre *"
                value={eventForm.title}
                onChangeText={t => setEventForm({ ...eventForm, title: t })}
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}
                data-testid="event-title-input"
              />
              <View style={{ marginBottom: 12, overflow: 'hidden' }}>
                <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Date *</Text>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e: any) => setEventForm({ ...eventForm, date: e.target.value })}
                  style={{ 
                    width: '100%', 
                    padding: 12, 
                    fontSize: 16,
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    boxSizing: 'border-box',
                    maxWidth: '100%',
                    WebkitAppearance: 'none',
                    appearance: 'none'
                  }}
                  data-testid="event-date-input"
                />
              </View>
              <TextInput
                placeholder="Description"
                value={eventForm.description}
                onChangeText={t => setEventForm({ ...eventForm, description: t })}
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}
                multiline
                data-testid="event-description-input"
              />
              
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setShowCreateModal(false)} style={{ padding: 12 }}>
                  <Text style={{ color: '#888' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={createEvent} 
                  style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
                  disabled={isSubmitting}
                  data-testid="save-event-btn"
                >
                  <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Créer'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // Event detail view
  if (!selectedEvent || !selectedEvent.event_id) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: '#888', fontSize: 16 }}>Chargement de l'événement...</Text>
        <TouchableOpacity 
          onPress={() => setSelectedEvent(null)} 
          style={{ marginTop: 20, backgroundColor: primaryColor, padding: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>← Retour à la liste</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity 
          onPress={() => setSelectedEvent(null)} 
          style={{ marginRight: 16 }}
          data-testid="back-to-events-btn"
        >
          <Text style={{ fontSize: 24 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: primaryColor }}>{selectedEvent?.title || 'Sans titre'}</Text>
          <Text style={{ fontSize: 14, color: '#666' }}>📅 {selectedEvent?.date ? formatEventDate(selectedEvent.date) : 'Date non définie'}</Text>
        </View>
        <TouchableOpacity 
          onPress={() => { setEventForm({ title: selectedEvent?.title || '', date: selectedEvent?.date || '', description: selectedEvent?.description || '', notes: selectedEvent?.notes || '', assigned_team: selectedEvent?.assigned_team || [] }); setShowEditModal(true); }}
          style={{ padding: 10 }}
          data-testid="edit-event-btn"
        >
          <Text>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#eee' }}>
        {(['providers', 'tasks', 'menu'] as const).map(tab => (
          <TouchableOpacity 
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: activeTab === tab ? primaryColor : 'transparent' }}
            data-testid={`tab-${tab}`}
          >
            <Text style={{ textAlign: 'center', fontWeight: activeTab === tab ? 'bold' : 'normal', color: activeTab === tab ? primaryColor : '#888' }}>
              {tab === 'providers' ? '👥 Prestataires' : tab === 'tasks' ? '✅ Tâches' : '🍽️ Menu'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* PROVIDERS TAB */}
      {activeTab === 'providers' && (
        <View>
          {canAddPrestataire && (
            <TouchableOpacity 
              onPress={() => { setEditingProvider(null); setProviderForm({ name: '', contact_name: '', phone: '', email: '', notes: '', start_time: '', end_time: '', price: '' }); setShowProviderModal(true); }}
              style={{ backgroundColor: primaryColor, padding: 12, borderRadius: 8, marginBottom: 16 }}
              data-testid="add-provider-btn"
            >
              <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: '600' }}>+ Ajouter un prestataire</Text>
            </TouchableOpacity>
          )}

          {providers.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>Aucun prestataire</Text>
          ) : (
            providers.map(provider => (
              <View key={provider.provider_id} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12 }} data-testid={`provider-${provider.provider_id}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor }}>{provider.name}</Text>
                    {provider.contact_name && <Text style={{ color: '#666' }}>Contact: {provider.contact_name}</Text>}
                    {provider.phone && <Text style={{ color: '#666' }}>📞 {provider.phone}</Text>}
                    {provider.email && <Text style={{ color: '#666' }}>✉️ {provider.email}</Text>}
                    {/* Horaires et tarif */}
                    <Text style={{ color: '#27ae60', marginTop: 4 }}>
                      🕐 {provider.start_time || '--:--'} - {provider.end_time || '--:--'}
                    </Text>
                    <Text style={{ color: '#e67e22', fontWeight: '600', marginTop: 2 }}>
                      💰 Tarif: {provider.price ? `${provider.price}€` : 'Non défini'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {canEditPrestataire && (
                      <TouchableOpacity onPress={() => { setEditingProvider(provider); setProviderForm({ name: provider.name, contact_name: provider.contact_name || '', phone: provider.phone || '', email: provider.email || '', notes: provider.notes || '', start_time: provider.start_time || '', end_time: provider.end_time || '', price: provider.price || '' }); setShowProviderModal(true); }}>
                        <Text>✏️</Text>
                      </TouchableOpacity>
                    )}
                    {canDeletePrestataire && (
                      <TouchableOpacity onPress={() => deleteProvider(provider.provider_id)}>
                        <Text>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Quote section */}
                <View style={{ marginTop: 12, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 8 }}>📄 Devis</Text>
                  {provider.quote_path ? (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <View style={[{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }, getQuoteStatusStyle(provider.quote_status)]}>
                          <Text style={{ fontSize: 12 }}>{provider.quote_status === 'validated' ? '✓ Validé' : 'En attente'}</Text>
                        </View>
                        {provider.quote_status !== 'validated' && (
                          <TouchableOpacity onPress={() => validateQuote(provider.provider_id, true)}>
                            <Text style={{ color: '#6bcb77' }}>Valider</Text>
                          </TouchableOpacity>
                        )}
                        {provider.quote_status === 'validated' && (
                          <TouchableOpacity onPress={() => validateQuote(provider.provider_id, false)}>
                            <Text style={{ color: '#888', fontSize: 12 }}>Annuler validation</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity 
                          onPress={() => downloadProviderFile(provider.provider_id, 'quote')}
                          style={{ backgroundColor: '#2196F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                          data-testid={`download-quote-${provider.provider_id}`}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>⬇️ Télécharger</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => uploadProviderFile(provider.provider_id, 'quote')}
                          style={{ backgroundColor: '#FF9800', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                          disabled={uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'quote'}
                          data-testid={`replace-quote-${provider.provider_id}`}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>
                            {uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'quote' ? '...' : '🔄 Remplacer'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      onPress={() => uploadProviderFile(provider.provider_id, 'quote')}
                      style={{ backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, alignSelf: 'flex-start' }}
                      disabled={uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'quote'}
                      data-testid={`upload-quote-${provider.provider_id}`}
                    >
                      <Text style={{ color: '#fff', fontSize: 13 }}>
                        {uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'quote' ? '⏳ Upload en cours...' : '📤 Uploader un devis PDF'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Invoice section */}
                <View style={{ marginTop: 8, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 8 }}>🧾 Facture</Text>
                  {provider.invoice_path ? (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <View style={[{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }, getInvoiceStatusStyle(provider.invoice_status)]}>
                          <Text style={{ fontSize: 12 }}>{getInvoiceStatusLabel(provider.invoice_status)}</Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => { setSelectedProviderForInvoice(provider); setInvoiceStatus(provider.invoice_status || 'pending'); setPaymentMethod(provider.payment_method || ''); setShowInvoiceStatusModal(true); }}
                        >
                          <Text style={{ color: primaryColor, fontSize: 13 }}>Modifier statut</Text>
                        </TouchableOpacity>
                      </View>
                      {provider.invoice_status === 'paid' && provider.payment_method && (
                        <Text style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>Payée par: {provider.payment_method === 'cash' ? '💵 Espèces' : provider.payment_method === 'card' ? '💳 Carte' : provider.payment_method === 'transfer' ? '🏦 Virement' : '📝 Chèque'}</Text>
                      )}
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity 
                          onPress={() => downloadProviderFile(provider.provider_id, 'invoice')}
                          style={{ backgroundColor: '#2196F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                          data-testid={`download-invoice-${provider.provider_id}`}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>⬇️ Télécharger</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => uploadProviderFile(provider.provider_id, 'invoice')}
                          style={{ backgroundColor: '#FF9800', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                          disabled={uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'invoice'}
                          data-testid={`replace-invoice-${provider.provider_id}`}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>
                            {uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'invoice' ? '...' : '🔄 Remplacer'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      onPress={() => uploadProviderFile(provider.provider_id, 'invoice')}
                      style={{ backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, alignSelf: 'flex-start' }}
                      disabled={uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'invoice'}
                      data-testid={`upload-invoice-${provider.provider_id}`}
                    >
                      <Text style={{ color: '#fff', fontSize: 13 }}>
                        {uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'invoice' ? '⏳ Upload en cours...' : '📤 Uploader une facture PDF'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Payment proof section - only show if invoice is paid by transfer */}
                {provider.invoice_status === 'paid' && provider.payment_method === 'transfer' && (
                  <View style={{ marginTop: 8, padding: 10, backgroundColor: '#e8f5e9', borderRadius: 8 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 8 }}>💸 Preuve de paiement</Text>
                    {provider.payment_proof_path ? (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity 
                          onPress={() => downloadProviderFile(provider.provider_id, 'payment_proof')}
                          style={{ backgroundColor: '#2196F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                          data-testid={`download-payment-proof-${provider.provider_id}`}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>⬇️ Télécharger</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => uploadProviderFile(provider.provider_id, 'payment_proof')}
                          style={{ backgroundColor: '#FF9800', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                          disabled={uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'payment_proof'}
                          data-testid={`replace-payment-proof-${provider.provider_id}`}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }}>
                            {uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'payment_proof' ? '...' : '🔄 Remplacer'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity 
                        onPress={() => uploadProviderFile(provider.provider_id, 'payment_proof')}
                        style={{ backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, alignSelf: 'flex-start' }}
                        disabled={uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'payment_proof'}
                        data-testid={`upload-payment-proof-${provider.provider_id}`}
                      >
                        <Text style={{ color: '#fff', fontSize: 13 }}>
                          {uploadingFile?.providerId === provider.provider_id && uploadingFile?.fileType === 'payment_proof' ? '⏳ Upload en cours...' : '📤 Uploader preuve de paiement'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* TASKS TAB */}
      {activeTab === 'tasks' && (
        <View>
          {canAddTask && (
            <TouchableOpacity 
              onPress={() => { setEditingTask(null); setTaskForm({ title: '', description: '', due_date: '', assigned_user_id: '' }); setShowTaskModal(true); }}
              style={{ backgroundColor: primaryColor, padding: 12, borderRadius: 8, marginBottom: 16 }}
              data-testid="add-task-btn"
            >
              <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: '600' }}>+ Ajouter une tâche</Text>
            </TouchableOpacity>
          )}

          {tasks.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>Aucune tâche</Text>
          ) : (
            tasks.map(task => (
              <View key={task.task_id} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: getStatusColor(task.status) }} data-testid={`task-${task.task_id}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: primaryColor }}>{task.title}</Text>
                    {task.description && <Text style={{ color: '#666', marginTop: 4 }}>{task.description}</Text>}
                    <Text style={{ color: '#888', fontSize: 13, marginTop: 4 }}>📅 Deadline: {formatEventDate(task.due_date)}</Text>
                    {task.assigned_user_name && <Text style={{ color: '#666', fontSize: 13 }}>👤 Assigné à: {task.assigned_user_name}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {canEditTask && (
                      <TouchableOpacity onPress={() => { setEditingTask(task); setTaskForm({ title: task.title, description: task.description || '', due_date: task.due_date, assigned_user_id: task.assigned_user_id || '' }); setShowTaskModal(true); }}>
                        <Text>✏️</Text>
                      </TouchableOpacity>
                    )}
                    {canDeleteTask && (
                      <TouchableOpacity onPress={() => deleteTask(task.task_id)}>
                        <Text>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {/* Status dropdown */}
                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 13, color: '#666' }}>Statut:</Text>
                  {(['todo', 'in_progress', 'completed'] as const).map(status => (
                    <TouchableOpacity 
                      key={status}
                      onPress={() => updateTaskStatus(task.task_id, status)}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: task.status === status ? getStatusColor(status) : '#eee' }}
                      data-testid={`task-status-${status}`}
                    >
                      <Text style={{ fontSize: 12, color: task.status === status ? '#fff' : '#666' }}>{getStatusLabel(status)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* MENU TAB */}
      {activeTab === 'menu' && (
        <View>
          {/* Export PDF Button */}
          <TouchableOpacity 
            onPress={exportEventMenuPDF}
            style={{ backgroundColor: '#e74c3c', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginBottom: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
            data-testid="export-menu-pdf-btn"
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>📄 Export PDF Menu</Text>
          </TouchableOpacity>
          
          {/* Sections */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>📋 Sections</Text>
              {canAddSection && (
                <TouchableOpacity 
                  onPress={() => { setEditingSection(null); setSectionForm({ name: '' }); setShowSectionModal(true); }}
                  style={{ backgroundColor: primaryColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                  data-testid="add-section-btn"
                >
                  <Text style={{ color: secondaryColor, fontSize: 13 }}>+ Section</Text>
                </TouchableOpacity>
              )}
            </View>
            {menuSections.map(section => {
              const sectionColor = section.color || getDefaultColorForSection(section.name);
              return (
              <View key={section.section_id} style={{ backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: sectionColor }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: sectionColor }} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: sectionColor }}>{section.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {canEditSection && (
                      <TouchableOpacity onPress={() => { setEditingSection(section); setSectionForm({ name: section.name, color: sectionColor }); setShowSectionModal(true); }}>
                        <Text>✏️</Text>
                      </TouchableOpacity>
                    )}
                    {canAddPlat && (
                      <TouchableOpacity onPress={() => { setEditingItem(null); setItemForm({ name: '', description: '', section_id: section.section_id, price: '' }); setShowItemModal(true); }}>
                        <Text>➕</Text>
                      </TouchableOpacity>
                    )}
                    {canDeleteSection && (
                      <TouchableOpacity onPress={() => deleteMenuSection(section.section_id)} data-testid={`delete-section-${section.section_id}`}>
                        <Text>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {/* Items in section */}
                {menuItems.filter(i => i.section_id === section.section_id).map(item => (
                  <View key={item.item_id} style={{ marginTop: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: sectionColor }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: sectionColor, fontWeight: '500' }}>{item.name}</Text>
                        {item.description && <Text style={{ fontSize: 12, color: '#8B4513', fontStyle: 'italic' }}>{item.description}</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {canEditPlat && (
                          <TouchableOpacity onPress={() => { setEditingItem(item); setItemForm({ name: item.name, description: item.description || '', section_id: item.section_id, price: item.price || '' }); setShowItemModal(true); }}>
                            <Text>✏️</Text>
                          </TouchableOpacity>
                        )}
                        {canDeletePlat && (
                          <TouchableOpacity onPress={() => deleteMenuItem(item.item_id)} data-testid={`delete-item-${item.item_id}`}>
                            <Text>🗑️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            );})}
          </View>

          {/* Price Packages */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>💰 Packages prix</Text>
              {canAddPackage && (
                <TouchableOpacity 
                  onPress={() => { setEditingPackage(null); setPackageForm({ name: '', section_ids: [], price: '' }); setShowPackageModal(true); }}
                  style={{ backgroundColor: primaryColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                  data-testid="add-package-btn"
                >
                  <Text style={{ color: secondaryColor, fontSize: 13 }}>+ Package</Text>
                </TouchableOpacity>
              )}
            </View>
            {pricePackages.length > 0 ? (
              pricePackages.map(pkg => (
                <View key={pkg.package_id} style={{ backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: primaryColor }}>
                      {pkg.section_ids.map((sid: string) => menuSections.find(s => s.section_id === sid)?.name || '?').join(' + ')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#27ae60' }}>{pkg.price}€</Text>
                    {canEditPackage && (
                      <TouchableOpacity onPress={() => { setEditingPackage(pkg); setPackageForm({ name: pkg.name, section_ids: pkg.section_ids, price: String(pkg.price) }); setShowPackageModal(true); }}>
                        <Text>✏️</Text>
                      </TouchableOpacity>
                    )}
                    {canDeletePackage && (
                      <TouchableOpacity onPress={() => deleteMenuPackage(pkg.package_id)} data-testid={`delete-package-${pkg.package_id}`}>
                        <Text>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            ) : (
              /* Afficher les prix des plats individuels s'il n'y a pas de package */
              <View style={{ backgroundColor: '#f8f9fa', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#e9ecef' }}>
                <Text style={{ color: '#666', fontStyle: 'italic', marginBottom: 12 }}>
                  Pas de package défini. Prix des plats individuels :
                </Text>
                {menuItems.filter(item => item.price).length > 0 ? (
                  <>
                    {/* Afficher par section (succession) */}
                    {menuSections.map(section => {
                      const sectionItems = menuItems.filter(item => item.section_id === section.section_id && item.price);
                      if (sectionItems.length === 0) return null;
                      return (
                        <View key={section.section_id} style={{ marginBottom: 12 }}>
                          <Text style={{ fontWeight: '600', color: section.color || '#3498db', marginBottom: 6, fontSize: 13 }}>{section.name}</Text>
                          {sectionItems.map(item => (
                            <View key={item.item_id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingLeft: 8 }}>
                              <Text style={{ color: '#333', flex: 1, fontSize: 13 }}>{item.name}</Text>
                              <Text style={{ color: '#27ae60', fontWeight: '600' }}>{item.price}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                    <View style={{ backgroundColor: '#e8f5e9', padding: 10, borderRadius: 8, marginTop: 8 }}>
                      <Text style={{ color: '#2e7d32', fontSize: 12, fontStyle: 'italic', textAlign: 'center' }}>
                        Note: Ces prix sont par plat. Le client choisit un plat par section (succession).
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={{ color: '#999', textAlign: 'center' }}>
                    Ajoutez des prix aux plats ou créez un package
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* MODALS */}

      {/* Edit Event Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '80%' }}>
            <ScrollView>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>Modifier événement</Text>
              <TextInput placeholder="Titre" value={eventForm.title} onChangeText={t => setEventForm({ ...eventForm, title: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Date</Text>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e: any) => setEventForm({ ...eventForm, date: e.target.value })}
                  style={{ 
                    width: '100%', 
                    padding: 12, 
                    fontSize: 16,
                    border: '1px solid #ddd',
                    borderRadius: '8px'
                  }}
                />
              </View>
              <TextInput placeholder="Description" value={eventForm.description} onChangeText={t => setEventForm({ ...eventForm, description: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} multiline />
              
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity onPress={updateEvent} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }} disabled={isSubmitting}>
                  <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Provider Modal - avec sélection depuis la liste des prestataires */}
      <Modal visible={showProviderModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>
              {editingProvider ? 'Modifier' : 'Ajouter'} prestataire
            </Text>
            
            {/* Mode de saisie - seulement si on n'est pas en mode édition */}
            {!editingProvider && (
              <View style={{ flexDirection: 'row', marginBottom: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd' }}>
                <TouchableOpacity 
                  style={{ flex: 1, padding: 12, backgroundColor: providerInputMode === 'select' ? primaryColor : '#fff', alignItems: 'center' }}
                  onPress={() => { setProviderInputMode('select'); setProviderForm({ name: '', contact_name: '', phone: '', email: '', notes: '' }); }}
                >
                  <Text style={{ color: providerInputMode === 'select' ? secondaryColor : '#666', fontWeight: '600' }}>Sélectionner</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, padding: 12, backgroundColor: providerInputMode === 'manual' ? primaryColor : '#fff', alignItems: 'center' }}
                  onPress={() => { setProviderInputMode('manual'); setSelectedPrestataireId(''); }}
                >
                  <Text style={{ color: providerInputMode === 'manual' ? secondaryColor : '#666', fontWeight: '600' }}>Saisie manuelle</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Mode Sélection - Liste des prestataires enregistrés */}
            {providerInputMode === 'select' && !editingProvider && (
              <ScrollView style={{ maxHeight: 300, marginBottom: 12 }}>
                {prestataires.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#999', textAlign: 'center' }}>
                      Aucun prestataire enregistré.{'\n'}Ajoutez-en dans Paramètres → Prestataires
                    </Text>
                    <TouchableOpacity 
                      onPress={() => { setProviderInputMode('manual'); }}
                      style={{ marginTop: 12, padding: 10 }}
                    >
                      <Text style={{ color: primaryColor, fontWeight: '600' }}>→ Saisir manuellement</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  prestataires.map((p) => (
                    <TouchableOpacity
                      key={p.prestataire_id}
                      style={{ 
                        padding: 14, 
                        borderWidth: 1, 
                        borderColor: selectedPrestataireId === p.prestataire_id ? primaryColor : '#ddd', 
                        borderRadius: 8, 
                        marginBottom: 8,
                        backgroundColor: selectedPrestataireId === p.prestataire_id ? `${primaryColor}10` : '#fff'
                      }}
                      onPress={() => {
                        setSelectedPrestataireId(p.prestataire_id);
                        setProviderForm({
                          name: p.nom_societe,
                          contact_name: p.contact || '',
                          phone: p.telephone || '',
                          email: p.email || '',
                          notes: p.tarifs ? `Tarifs: ${p.tarifs}${p.note ? '\n' + p.note : ''}` : (p.note || ''),
                          start_time: '',
                          end_time: '',
                          price: p.tarifs || ''
                        });
                      }}
                    >
                      <Text style={{ fontWeight: '600', color: primaryColor }}>{p.nom_societe}</Text>
                      {p.contact && <Text style={{ color: '#666', fontSize: 13 }}>{p.contact}</Text>}
                      {p.telephone && <Text style={{ color: '#888', fontSize: 12 }}>📞 {p.telephone}</Text>}
                      {p.tarifs && <Text style={{ color: '#888', fontSize: 12 }}>💰 {p.tarifs}</Text>}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
            
            {/* Champs horaires et tarif pour le mode sélection (après avoir choisi un prestataire) */}
            {providerInputMode === 'select' && selectedPrestataireId && !editingProvider && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
                <Text style={{ fontWeight: '600', color: '#333', marginBottom: 12 }}>Détails pour cet événement (optionnel)</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, paddingRight: 4 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Heure début</Text>
                    <input
                      type="time"
                      value={providerForm.start_time}
                      onChange={(e: any) => setProviderForm({ ...providerForm, start_time: e.target.value })}
                      style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Heure fin</Text>
                    <input
                      type="time"
                      value={providerForm.end_time}
                      onChange={(e: any) => setProviderForm({ ...providerForm, end_time: e.target.value })}
                      style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                  </View>
                </View>
                <TextInput placeholder="Tarif pour cet événement (ex: 500€)" value={providerForm.price} onChangeText={t => setProviderForm({ ...providerForm, price: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
              </View>
            )}
            
            {/* Mode Manuel ou Édition - Formulaire */}
            {(providerInputMode === 'manual' || editingProvider) && (
              <>
                <TextInput placeholder="Nom *" value={providerForm.name} onChangeText={t => setProviderForm({ ...providerForm, name: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
                <TextInput placeholder="Nom du contact" value={providerForm.contact_name} onChangeText={t => setProviderForm({ ...providerForm, contact_name: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
                <TextInput placeholder="Téléphone" value={providerForm.phone} onChangeText={t => setProviderForm({ ...providerForm, phone: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
                <TextInput placeholder="Email" value={providerForm.email} onChangeText={t => setProviderForm({ ...providerForm, email: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} keyboardType="email-address" />
                
                {/* Horaires et Tarif pour l'événement */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, paddingRight: 4 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Heure début</Text>
                    <input
                      type="time"
                      value={providerForm.start_time}
                      onChange={(e: any) => setProviderForm({ ...providerForm, start_time: e.target.value })}
                      style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Heure fin</Text>
                    <input
                      type="time"
                      value={providerForm.end_time}
                      onChange={(e: any) => setProviderForm({ ...providerForm, end_time: e.target.value })}
                      style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                  </View>
                </View>
                <TextInput placeholder="Tarif (ex: 500€)" value={providerForm.price} onChangeText={t => setProviderForm({ ...providerForm, price: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
                
                <TextInput placeholder="Notes" value={providerForm.notes} onChangeText={t => setProviderForm({ ...providerForm, notes: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} multiline />
              </>
            )}
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={() => { setShowProviderModal(false); setSelectedPrestataireId(''); setProviderInputMode('select'); }} style={{ padding: 12 }}>
                <Text style={{ color: '#888' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={saveProvider} 
                style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, opacity: (!providerForm.name && providerInputMode === 'select' && !selectedPrestataireId) ? 0.5 : 1 }} 
                disabled={isSubmitting || (!providerForm.name && providerInputMode === 'select' && !selectedPrestataireId)}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Task Modal */}
      <Modal visible={showTaskModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>{editingTask ? 'Modifier' : 'Ajouter'} tâche</Text>
            <TextInput placeholder="Titre *" value={taskForm.title} onChangeText={t => setTaskForm({ ...taskForm, title: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
            <TextInput placeholder="Description" value={taskForm.description} onChangeText={t => setTaskForm({ ...taskForm, description: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} multiline />
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Deadline *</Text>
              <input
                type="date"
                value={taskForm.due_date}
                onChange={(e: any) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: 12, 
                  fontSize: 16,
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  boxSizing: 'border-box',
                  maxWidth: '100%'
                }}
              />
            </View>
            <Text style={{ marginBottom: 8, color: '#666' }}>Assigné à:</Text>
            <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setTaskForm({ ...taskForm, assigned_user_id: '' })} style={{ padding: 10, backgroundColor: !taskForm.assigned_user_id ? '#e3f2fd' : 'transparent' }}>
                <Text>— Non assigné —</Text>
              </TouchableOpacity>
              {(users || []).map(u => (
                <TouchableOpacity key={u.user_id} onPress={() => setTaskForm({ ...taskForm, assigned_user_id: u.user_id })} style={{ padding: 10, backgroundColor: taskForm.assigned_user_id === u.user_id ? '#e3f2fd' : 'transparent' }}>
                  <Text>{u.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={() => setShowTaskModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveTask} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }} disabled={isSubmitting}>
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Section Modal */}
      <Modal visible={showSectionModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>{editingSection ? 'Modifier' : 'Ajouter'} section</Text>
            <TextInput placeholder="Nom de la section *" value={sectionForm.name} onChangeText={t => setSectionForm({ ...sectionForm, name: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
            
            {/* Color Picker */}
            <Text style={{ color: '#666', marginBottom: 8, fontSize: 13 }}>Couleur de la section</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {sectionColors.map(color => (
                <TouchableOpacity 
                  key={color.value}
                  onPress={() => setSectionForm({ ...sectionForm, color: color.value })}
                  style={{ 
                    width: 36, 
                    height: 36, 
                    backgroundColor: color.value, 
                    borderRadius: 8,
                    borderWidth: sectionForm.color === color.value ? 3 : 0,
                    borderColor: '#333',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  {sectionForm.color === color.value && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={() => setShowSectionModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveSection} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }} disabled={isSubmitting}>
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Item Modal */}
      <Modal visible={showItemModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>{editingItem ? 'Modifier' : 'Ajouter'} plat</Text>
            <TextInput placeholder="Nom du plat *" value={itemForm.name} onChangeText={t => setItemForm({ ...itemForm, name: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
            <TextInput placeholder="Description" value={itemForm.description} onChangeText={t => setItemForm({ ...itemForm, description: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} multiline />
            <TextInput placeholder="Prix (optionnel, ex: 25€)" value={itemForm.price} onChangeText={t => setItemForm({ ...itemForm, price: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={() => setShowItemModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveItem} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }} disabled={isSubmitting}>
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Package Modal */}
      <Modal visible={showPackageModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>{editingPackage ? 'Modifier' : 'Ajouter'} package</Text>
            <TextInput placeholder="Nom (ex: Entrée + Plat) *" value={packageForm.name} onChangeText={t => setPackageForm({ ...packageForm, name: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
            <Text style={{ marginBottom: 8, color: '#666' }}>Sections incluses:</Text>
            <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 12, maxHeight: 150 }}>
              {menuSections.map(s => (
                <TouchableOpacity 
                  key={s.section_id}
                  onPress={() => {
                    const ids = packageForm.section_ids.includes(s.section_id)
                      ? packageForm.section_ids.filter(id => id !== s.section_id)
                      : [...packageForm.section_ids, s.section_id];
                    setPackageForm({ ...packageForm, section_ids: ids });
                  }}
                  style={{ padding: 10, backgroundColor: packageForm.section_ids.includes(s.section_id) ? '#e3f2fd' : 'transparent', flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text>{packageForm.section_ids.includes(s.section_id) ? '☑️' : '⬜'} {s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput placeholder="Prix (€) * (ex: 29,50)" value={packageForm.price} onChangeText={t => setPackageForm({ ...packageForm, price: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} keyboardType="decimal-pad" inputMode="decimal" />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={() => setShowPackageModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity onPress={savePackage} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }} disabled={isSubmitting}>
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Drink Modal */}
      <Modal visible={showDrinkModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>{editingDrink ? 'Modifier' : 'Ajouter'} boisson</Text>
            <TextInput placeholder="Nom *" value={drinkForm.name} onChangeText={t => setDrinkForm({ ...drinkForm, name: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} />
            <TextInput placeholder="Prix (€) * (ex: 14,50)" value={drinkForm.price} onChangeText={t => setDrinkForm({ ...drinkForm, price: t })} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 }} keyboardType="decimal-pad" inputMode="decimal" />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={() => setShowDrinkModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveDrink} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }} disabled={isSubmitting}>
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>{isSubmitting ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invoice Status Modal */}
      <Modal visible={showInvoiceStatusModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor, marginBottom: 20 }}>Statut facture</Text>
            <Text style={{ marginBottom: 12, color: '#666' }}>Sélectionnez le statut:</Text>
            {['pending', 'awaiting_payment', 'paid'].map(status => (
              <TouchableOpacity 
                key={status}
                onPress={() => setInvoiceStatus(status)}
                style={{ padding: 12, borderRadius: 8, marginBottom: 8, backgroundColor: invoiceStatus === status ? '#e3f2fd' : '#f5f5f5' }}
              >
                <Text>{status === 'pending' ? '⏳ Non uploadée' : status === 'awaiting_payment' ? '⏳ En attente de paiement' : '✅ Payée'}</Text>
              </TouchableOpacity>
            ))}
            {invoiceStatus === 'paid' && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ marginBottom: 8, color: '#666' }}>Méthode de paiement *:</Text>
                {['cash', 'card', 'transfer', 'check'].map(method => (
                  <TouchableOpacity 
                    key={method}
                    onPress={() => setPaymentMethod(method)}
                    style={{ padding: 10, borderRadius: 8, marginBottom: 6, backgroundColor: paymentMethod === method ? '#e8f5e9' : '#f5f5f5' }}
                  >
                    <Text>{method === 'cash' ? '💵 Espèces' : method === 'card' ? '💳 Carte' : method === 'transfer' ? '🏦 Virement' : '📝 Chèque'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowInvoiceStatusModal(false)} style={{ padding: 12 }}><Text style={{ color: '#888' }}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity onPress={updateProviderInvoiceStatus} style={{ backgroundColor: primaryColor, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}>
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Event PDF Preview Modal */}
      <Modal visible={showEventPdfPreview} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 10 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, width: '100%', maxWidth: 900, height: '95%', overflow: 'hidden' }}>
            {/* Header with buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1A1A2E', borderBottomWidth: 1, borderBottomColor: '#333' }}>
              <TouchableOpacity 
                onPress={closeEventPdfPreview}
                style={{ backgroundColor: '#666', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                data-testid="event-pdf-back-btn"
              >
                <Text style={{ color: 'white', fontSize: 18 }}>←</Text>
                <Text style={{ color: 'white', fontWeight: '600' }}>Retour</Text>
              </TouchableOpacity>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'center' }}>
                Aperçu Menu - {selectedEvent?.title}
              </Text>
              <TouchableOpacity 
                onPress={downloadEventPdfFromPreview}
                style={{ backgroundColor: '#27ae60', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                data-testid="event-pdf-download-btn"
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Télécharger</Text>
                <Text style={{ color: 'white', fontSize: 18 }}>⬇</Text>
              </TouchableOpacity>
            </View>
            {/* PDF Viewer */}
            <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
              {eventPdfUrl && (
                <iframe
                  src={eventPdfUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="Event PDF Preview"
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ==================== FACTURATION SCREEN (Devis et Factures) ====================
function FacturationScreen({ invoices, menuRestaurantSections, menuRestaurantItems, primaryColor, secondaryColor, apiRequest, loadInvoices, restaurant, loadMenuRestaurantSections, loadMenuRestaurantItems }: any) {
  const [activeTab, setActiveTab] = useState<'quotes' | 'invoices'>('quotes');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // État pour le modal PDF de prévisualisation
  const [showInvoicePdfModal, setShowInvoicePdfModal] = useState(false);
  const [invoicePdfUrl, setInvoicePdfUrl] = useState('');
  const [invoicePdfTitle, setInvoicePdfTitle] = useState('');
  
  // État pour la sélection de format multi-taille
  const [showFormatSelector, setShowFormatSelector] = useState<any>(null);
  
  // États pour le sélecteur de produits amélioré
  const [productSelectorTab, setProductSelectorTab] = useState<'food' | 'boisson'>('food');
  const [productSelectorSection, setProductSelectorSection] = useState<string | null>(null);
  const [productSelectorSearch, setProductSelectorSearch] = useState('');
  const [productSelectorAllergens, setProductSelectorAllergens] = useState<string[]>([]);
  const [showProductAllergenFilter, setShowProductAllergenFilter] = useState(false);
  
  // Form states
  const [docType, setDocType] = useState<'quote' | 'invoice'>('quote');
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  useEffect(() => {
    loadMenuRestaurantSections();
    loadMenuRestaurantItems();
  }, []);
  
  const quotes = invoices.filter((inv: any) => inv.type === 'quote');
  const invoicesList = invoices.filter((inv: any) => inv.type === 'invoice');
  
  const handleProductClick = (product: any) => {
    // Vérifier si le produit a plusieurs formats (multi-taille)
    const formats = product.formats || [];
    if (formats.length > 1) {
      // Afficher le sélecteur de format
      setShowFormatSelector(product);
    } else if (formats.length === 1) {
      // Un seul format, l'ajouter directement
      addProductWithFormat(product, formats[0]);
    } else {
      // Pas de format, utiliser le prix principal
      addProductToSelection(product);
    }
  };
  
  const addProductWithFormat = (product: any, format: any) => {
    const itemName = `${product.name} (${format.name})`;
    const existing = selectedItems.find(item => item.name === itemName);
    if (existing) {
      setSelectedItems(selectedItems.map(item => 
        item.name === itemName ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        name: itemName,
        description: product.descriptions?.[0] || '',
        quantity: 1,
        unit_price_ttc: format.selling_price || format.price || 0,
        tva_rate: product.tva_rate || 10
      }]);
    }
    setShowFormatSelector(null);
  };
  
  const addProductToSelection = (product: any) => {
    const existing = selectedItems.find(item => item.name === product.name);
    if (existing) {
      setSelectedItems(selectedItems.map(item => 
        item.name === product.name ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        name: product.name,
        description: product.descriptions?.[0] || '',
        quantity: 1,
        unit_price_ttc: product.price || 0,
        tva_rate: product.tva_rate || 10
      }]);
    }
  };
  
  const updateItemQuantity = (index: number, change: number) => {
    const newItems = [...selectedItems];
    newItems[index].quantity = Math.max(1, newItems[index].quantity + change);
    setSelectedItems(newItems);
  };
  
  const removeItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };
  
  const calculateTotals = () => {
    let totalHT = 0;
    let tva10 = 0;
    let tva20 = 0;
    
    selectedItems.forEach(item => {
      const lineTTC = item.unit_price_ttc * item.quantity;
      const lineHT = lineTTC / (1 + item.tva_rate / 100);
      const lineTVA = lineTTC - lineHT;
      totalHT += lineHT;
      if (item.tva_rate === 10) tva10 += lineTVA;
      else tva20 += lineTVA;
    });
    
    return {
      totalHT: totalHT.toFixed(2),
      tva10: tva10.toFixed(2),
      tva20: tva20.toFixed(2),
      totalTTC: (totalHT + tva10 + tva20).toFixed(2)
    };
  };
  
  const resetForm = () => {
    setClientName('');
    setClientCompany('');
    setClientAddress('');
    setClientEmail('');
    setClientPhone('');
    setSelectedItems([]);
    setNotes('');
    setValidUntil('');
    setDueDate('');
  };
  
  const createDocument = async () => {
    if (!clientName || selectedItems.length === 0) {
      showAlert('Erreur', 'Veuillez remplir le nom du client et ajouter au moins un produit');
      return;
    }
    
    setIsLoading(true);
    try {
      await apiRequest('/invoices/create', {
        method: 'POST',
        body: JSON.stringify({
          type: docType,
          client: {
            name: clientName,
            company: clientCompany || null,
            address: clientAddress || null,
            email: clientEmail || null,
            phone: clientPhone || null
          },
          items: selectedItems,
          notes: notes || null,
          valid_until: validUntil || null,
          due_date: dueDate || null
        })
      });
      
      resetForm();
      setShowCreateModal(false);
      loadInvoices();
      showAlert('Succès', `${docType === 'quote' ? 'Devis' : 'Facture'} créé(e) avec succès`);
    } catch (error: any) {
      showAlert('Erreur', error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const previewPDF = async (doc: any) => {
    try {
      const response = await fetch(`${API_URL}/invoices/${doc.invoice_id}/pdf`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('sessionToken')}` }
      });
      if (!response.ok) throw new Error('Erreur lors du chargement du PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setInvoicePdfUrl(url);
      setInvoicePdfTitle(`${doc.type === 'quote' ? 'Devis' : 'Facture'} - ${doc.number}`);
      setShowInvoicePdfModal(true);
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const downloadInvoicePdfFromPreview = () => {
    if (invoicePdfUrl) {
      const a = document.createElement('a');
      a.href = invoicePdfUrl;
      a.download = `${invoicePdfTitle.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };
  
  const closeInvoicePdfModal = () => {
    if (invoicePdfUrl) {
      window.URL.revokeObjectURL(invoicePdfUrl);
    }
    setInvoicePdfUrl('');
    setInvoicePdfTitle('');
    setShowInvoicePdfModal(false);
  };
  
  const convertToInvoice = async (invoiceId: string) => {
    try {
      await apiRequest(`/invoices/${invoiceId}/convert-to-invoice`, { method: 'POST' });
      loadInvoices();
      showAlert('Succès', 'Devis converti en facture');
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const deleteDocument = async (invoiceId: string) => {
    if (Platform.OS === 'web') {
      if (!(await showConfirm('Supprimer ce document ?'))) return;
    }
    try {
      await apiRequest(`/invoices/${invoiceId}`, { method: 'DELETE' });
      loadInvoices();
    } catch (error: any) {
      showAlert('Erreur', error.message);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      draft: { color: '#666', text: 'Brouillon' },
      sent: { color: '#2196F3', text: 'Envoyé' },
      accepted: { color: '#4CAF50', text: 'Accepté' },
      rejected: { color: '#f44336', text: 'Refusé' },
      paid: { color: '#4CAF50', text: 'Payé' }
    };
    const config = statusConfig[status] || statusConfig.draft;
    return (
      <View style={{ backgroundColor: config.color + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
        <Text style={{ color: config.color, fontSize: 11, fontWeight: '600' }}>{config.text}</Text>
      </View>
    );
  };
  
  const totals = calculateTotals();
  
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>📄 Facturation</Text>
        
        {/* Tabs */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, backgroundColor: activeTab === 'quotes' ? primaryColor : '#eee', borderRadius: 8, marginRight: 8 }}
            onPress={() => setActiveTab('quotes')}
          >
            <Text style={{ textAlign: 'center', color: activeTab === 'quotes' ? secondaryColor : '#666', fontWeight: '600' }}>Devis ({quotes.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 1, padding: 12, backgroundColor: activeTab === 'invoices' ? primaryColor : '#eee', borderRadius: 8 }}
            onPress={() => setActiveTab('invoices')}
          >
            <Text style={{ textAlign: 'center', color: activeTab === 'invoices' ? secondaryColor : '#666', fontWeight: '600' }}>Factures ({invoicesList.length})</Text>
          </TouchableOpacity>
        </View>
        
        {/* Create button */}
        <TouchableOpacity 
          style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => { setDocType(activeTab === 'quotes' ? 'quote' : 'invoice'); setShowCreateModal(true); }}
          data-testid="create-invoice-btn"
        >
          <WebIcon name="add-circle-outline" size={22} color={secondaryColor} />
          <Text style={{ color: secondaryColor, fontWeight: '600', marginLeft: 8 }}>
            Créer un {activeTab === 'quotes' ? 'devis' : 'facture'}
          </Text>
        </TouchableOpacity>
        
        {/* List */}
        {(activeTab === 'quotes' ? quotes : invoicesList).map((doc: any) => (
          <View key={doc.invoice_id} style={{ backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, padding: 16, borderWidth: 1, borderColor: '#eee' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, flex: 1 }}>{doc.number}</Text>
              {getStatusBadge(doc.status)}
            </View>
            <Text style={{ color: '#666', marginBottom: 4 }}>{doc.client?.company || doc.client?.name}</Text>
            <Text style={{ color: '#333', fontWeight: '600' }}>Total: {doc.totals?.total_ttc?.toFixed(2)}€ TTC</Text>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              Créé le {new Date(doc.created_at).toLocaleDateString('fr-FR')}
            </Text>
            
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 6, alignItems: 'center' }}
                onPress={() => previewPDF(doc)}
                data-testid="preview-invoice-pdf-btn"
              >
                <Text style={{ color: '#333', fontWeight: '500' }}>Voir PDF</Text>
              </TouchableOpacity>
              {doc.type === 'quote' && doc.status !== 'accepted' && (
                <TouchableOpacity 
                  style={{ flex: 1, padding: 10, backgroundColor: '#4CAF50', borderRadius: 6, alignItems: 'center' }}
                  onPress={() => convertToInvoice(doc.invoice_id)}
                >
                  <Text style={{ color: '#fff', fontWeight: '500' }}>→ Facture</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={{ padding: 10, backgroundColor: '#ffebee', borderRadius: 6 }}
                onPress={() => deleteDocument(doc.invoice_id)}
              >
                <WebIcon name="trash-outline" size={18} color="#f44336" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        
        {(activeTab === 'quotes' ? quotes : invoicesList).length === 0 && (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <WebIcon name="document-outline" size={48} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 12 }}>Aucun {activeTab === 'quotes' ? 'devis' : 'facture'}</Text>
          </View>
        )}
      </View>
      
      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ flex: 1, marginTop: 60, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor }}>
                {docType === 'quote' ? 'Nouveau devis' : 'Nouvelle facture'}
              </Text>
              <TouchableOpacity onPress={() => { resetForm(); setShowCreateModal(false); }}>
                <WebIcon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ flex: 1, padding: 16 }}>
              {/* Client info */}
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Informations client</Text>
              <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Nom du client *" value={clientName} onChangeText={setClientName} />
              <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Société (optionnel)" value={clientCompany} onChangeText={setClientCompany} />
              <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Adresse (optionnel)" value={clientAddress} onChangeText={setClientAddress} multiline />
              <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 }} placeholder="Email *" value={clientEmail} onChangeText={setClientEmail} keyboardType="email-address" />
              <TextInput style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16 }} placeholder="Téléphone *" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
              
              {/* Products */}
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor, marginBottom: 12 }}>Produits</Text>
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 12, borderRadius: 8, marginBottom: 16, alignItems: 'center' }}
                onPress={() => setShowProductSelector(true)}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>+ Ajouter des produits</Text>
              </TouchableOpacity>
              
              {selectedItems.map((item, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '500', color: primaryColor }}>{item.name}</Text>
                    <Text style={{ color: '#666', fontSize: 12 }}>{item.unit_price_ttc}€ TTC (TVA {item.tva_rate}%)</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => updateItemQuantity(index, -1)} style={{ padding: 6 }}>
                      <WebIcon name="remove-circle-outline" size={24} color={primaryColor} />
                    </TouchableOpacity>
                    <Text style={{ marginHorizontal: 8, fontWeight: '600' }}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => updateItemQuantity(index, 1)} style={{ padding: 6 }}>
                      <WebIcon name="add-circle-outline" size={24} color={primaryColor} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(index)} style={{ padding: 6, marginLeft: 8 }}>
                      <WebIcon name="trash-outline" size={20} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              
              {/* Totals */}
              {selectedItems.length > 0 && (
                <View style={{ backgroundColor: '#f0f0f0', borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#666' }}>Total HT</Text>
                    <Text style={{ fontWeight: '500' }}>{totals.totalHT}€</Text>
                  </View>
                  {parseFloat(totals.tva10) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#666' }}>TVA 10%</Text>
                      <Text style={{ fontWeight: '500' }}>{totals.tva10}€</Text>
                    </View>
                  )}
                  {parseFloat(totals.tva20) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#666' }}>TVA 20%</Text>
                      <Text style={{ fontWeight: '500' }}>{totals.tva20}€</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ddd' }}>
                    <Text style={{ fontWeight: '600', color: primaryColor }}>Total TTC</Text>
                    <Text style={{ fontWeight: '700', color: primaryColor, fontSize: 16 }}>{totals.totalTTC}€</Text>
                  </View>
                </View>
              )}
              
              {/* Notes */}
              <TextInput 
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, minHeight: 80 }} 
                placeholder="Notes ou conditions (optionnel)" 
                value={notes} 
                onChangeText={setNotes}
                multiline
              />
              
              {/* Dates */}
              {docType === 'quote' && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Valide jusqu'au</Text>
                  <input type="date" value={validUntil} onChange={(e: any) => setValidUntil(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' }} />
                </View>
              )}
              {docType === 'invoice' && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#666', marginBottom: 4, fontSize: 12 }}>Échéance</Text>
                  <input type="date" value={dueDate} onChange={(e: any) => setDueDate(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' }} />
                </View>
              )}
            </ScrollView>
            
            {/* Submit */}
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 16, borderRadius: 8, alignItems: 'center' }}
                onPress={createDocument}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={secondaryColor} />
                ) : (
                  <Text style={{ color: secondaryColor, fontWeight: '600', fontSize: 16 }}>
                    Créer le {docType === 'quote' ? 'devis' : 'facture'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Product Selector Modal */}
      <Modal visible={showProductSelector} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ flex: 1, marginTop: 60, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            {/* Header avec onglets */}
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: primaryColor }}>
                  {productSelectorTab === 'food' ? '🍽️ Carte Food' : '🍸 Carte Boisson'}
                </Text>
                <TouchableOpacity onPress={() => setShowProductSelector(false)}>
                  <WebIcon name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              {/* Onglets Food / Boisson */}
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    paddingVertical: 10, 
                    backgroundColor: productSelectorTab === 'food' ? primaryColor : '#f0f0f0',
                    borderRadius: 8,
                    marginRight: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => { setProductSelectorTab('food'); setProductSelectorSection(null); }}
                >
                  <Text style={{ color: productSelectorTab === 'food' ? '#fff' : '#666', fontWeight: '600' }}>🍽️ Carte Food</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    paddingVertical: 10, 
                    backgroundColor: productSelectorTab === 'boisson' ? primaryColor : '#f0f0f0',
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                  onPress={() => { setProductSelectorTab('boisson'); setProductSelectorSection(null); }}
                >
                  <Text style={{ color: productSelectorTab === 'boisson' ? '#fff' : '#666', fontWeight: '600' }}>🍸 Carte Boisson</Text>
                </TouchableOpacity>
              </View>
              
              {/* Filtre allergènes */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: productSelectorAllergens.length > 0 ? '#ffebee' : '#f5f5f5', borderRadius: 8, marginBottom: 10 }}
                onPress={() => setShowProductAllergenFilter(!showProductAllergenFilter)}
              >
                <Text style={{ fontSize: 16 }}>🥜</Text>
                <Text style={{ marginLeft: 8, color: productSelectorAllergens.length > 0 ? '#c62828' : '#666', fontWeight: '500', flex: 1 }}>
                  {productSelectorAllergens.length > 0 ? `Allergènes exclus (${productSelectorAllergens.length})` : 'Filtrer par allergènes'}
                </Text>
                <WebIcon name={showProductAllergenFilter ? "chevron-up" : "chevron-down"} size={20} color={productSelectorAllergens.length > 0 ? '#c62828' : '#999'} />
              </TouchableOpacity>
              
              {/* Liste des allergènes si filtre ouvert */}
              {showProductAllergenFilter && (
                <View style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {['gluten', 'crustaces', 'oeufs', 'poisson', 'arachides', 'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques'].map(allergen => (
                      <TouchableOpacity 
                        key={allergen}
                        style={{ 
                          paddingHorizontal: 12, 
                          paddingVertical: 6, 
                          backgroundColor: productSelectorAllergens.includes(allergen) ? '#ef5350' : '#e0e0e0',
                          borderRadius: 16
                        }}
                        onPress={() => {
                          if (productSelectorAllergens.includes(allergen)) {
                            setProductSelectorAllergens(productSelectorAllergens.filter(a => a !== allergen));
                          } else {
                            setProductSelectorAllergens([...productSelectorAllergens, allergen]);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 12, color: productSelectorAllergens.includes(allergen) ? '#fff' : '#333' }}>
                          {allergen.replace(/_/g, ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {productSelectorAllergens.length > 0 && (
                    <TouchableOpacity 
                      style={{ marginTop: 8, alignItems: 'center' }}
                      onPress={() => setProductSelectorAllergens([])}
                    >
                      <Text style={{ color: '#c62828', fontSize: 12 }}>Réinitialiser les filtres</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              
              {/* Barre de recherche */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12 }}>
                <WebIcon name="search" size={18} color="#999" />
                <TextInput 
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: '#333' }}
                  placeholder="Rechercher un produit..."
                  placeholderTextColor="#999"
                  value={productSelectorSearch}
                  onChangeText={setProductSelectorSearch}
                />
                {productSelectorSearch ? (
                  <TouchableOpacity onPress={() => setProductSelectorSearch('')}>
                    <WebIcon name="close-circle" size={18} color="#999" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            
            {/* Navigation par sections (scroll horizontal) */}
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                <TouchableOpacity 
                  style={{ 
                    paddingHorizontal: 16, 
                    paddingVertical: 8, 
                    backgroundColor: productSelectorSection === null ? primaryColor : '#f0f0f0',
                    borderRadius: 20,
                    marginRight: 8
                  }}
                  onPress={() => setProductSelectorSection(null)}
                >
                  <Text style={{ color: productSelectorSection === null ? '#fff' : '#666', fontWeight: '500', fontSize: 13 }}>Tout</Text>
                </TouchableOpacity>
                {menuRestaurantSections
                  .filter((s: any) => s.menu_type === productSelectorTab)
                  .map((section: any) => (
                    <TouchableOpacity 
                      key={section.section_id}
                      style={{ 
                        paddingHorizontal: 16, 
                        paddingVertical: 8, 
                        backgroundColor: productSelectorSection === section.section_id ? primaryColor : '#f0f0f0',
                        borderRadius: 20,
                        marginRight: 8
                      }}
                      onPress={() => setProductSelectorSection(section.section_id)}
                    >
                      <Text style={{ color: productSelectorSection === section.section_id ? '#fff' : '#666', fontWeight: '500', fontSize: 13 }}>{section.name}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
            
            {/* Liste des produits */}
            <ScrollView style={{ flex: 1, padding: 16 }}>
              {menuRestaurantSections
                .filter((s: any) => s.menu_type === productSelectorTab)
                .filter((s: any) => productSelectorSection === null || s.section_id === productSelectorSection)
                .map((section: any) => {
                  let sectionItems = menuRestaurantItems.filter((item: any) => item.section_id === section.section_id);
                  
                  // Filtre par recherche
                  if (productSelectorSearch) {
                    const search = productSelectorSearch.toLowerCase();
                    sectionItems = sectionItems.filter((item: any) => 
                      item.name?.toLowerCase().includes(search) ||
                      item.descriptions?.some((d: string) => d.toLowerCase().includes(search))
                    );
                  }
                  
                  // Filtre par allergènes (exclure les items qui contiennent un allergène sélectionné)
                  if (productSelectorAllergens.length > 0) {
                    sectionItems = sectionItems.filter((item: any) => {
                      const itemAllergens = item.allergens || [];
                      return !productSelectorAllergens.some(a => itemAllergens.includes(a));
                    });
                  }
                  
                  if (sectionItems.length === 0) return null;
                  
                  return (
                    <View key={section.section_id} style={{ marginBottom: 20 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: primaryColor, marginBottom: 10, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: primaryColor }}>
                        {section.name}
                      </Text>
                      {sectionItems.map((item: any) => {
                        const formats = item.formats || [];
                        const hasMultipleFormats = formats.length > 1;
                        const singleFormatPrice = formats.length === 1 ? (formats[0].selling_price || formats[0].price) : null;
                        const displayPrice = item.price || singleFormatPrice;
                        
                        return (
                          <TouchableOpacity 
                            key={item.item_id}
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 8 }}
                            onPress={() => handleProductClick(item)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontWeight: '500', color: '#333' }}>{item.name}</Text>
                              {item.descriptions?.[0] && (
                                <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{item.descriptions[0]}</Text>
                              )}
                              {hasMultipleFormats ? (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                                  {formats.map((f: any, i: number) => (
                                    <Text key={i} style={{ color: '#9c27b0', fontSize: 11, marginRight: 8 }}>
                                      {f.name}: {(f.selling_price || f.price || 0).toFixed(2)}€
                                    </Text>
                                  ))}
                                </View>
                              ) : displayPrice ? (
                                <Text style={{ color: primaryColor, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{displayPrice.toFixed(2)}€</Text>
                              ) : null}
                            </View>
                            <View style={{ backgroundColor: hasMultipleFormats ? '#9c27b0' : primaryColor, borderRadius: 20, padding: 6 }}>
                              <WebIcon name="add" size={20} color="#fff" />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              
              {/* Message si aucun résultat */}
              {menuRestaurantSections
                .filter((s: any) => s.menu_type === productSelectorTab)
                .filter((s: any) => productSelectorSection === null || s.section_id === productSelectorSection)
                .every((section: any) => {
                  let sectionItems = menuRestaurantItems.filter((item: any) => item.section_id === section.section_id);
                  if (productSelectorSearch) {
                    const search = productSelectorSearch.toLowerCase();
                    sectionItems = sectionItems.filter((item: any) => 
                      item.name?.toLowerCase().includes(search)
                    );
                  }
                  return sectionItems.length === 0;
                }) && (
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <WebIcon name="search" size={48} color="#ccc" />
                  <Text style={{ color: '#999', marginTop: 12 }}>Aucun produit trouvé</Text>
                </View>
              )}
            </ScrollView>
            
            {/* Bouton Terminé */}
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 14, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setShowProductSelector(false)}
              >
                <Text style={{ color: secondaryColor, fontWeight: '600' }}>Terminé ({selectedItems.length} produits)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Modal de sélection de format/taille */}
      <Modal
        visible={showFormatSelector !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFormatSelector(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '90%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: primaryColor }}>Choisir la taille</Text>
              <TouchableOpacity onPress={() => setShowFormatSelector(null)}>
                <WebIcon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>{showFormatSelector?.name}</Text>
              
              {(showFormatSelector?.formats || []).map((format: any, index: number) => (
                <TouchableOpacity 
                  key={format.format_id || index}
                  style={{ 
                    flexDirection: 'row', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: 14, 
                    backgroundColor: '#f9f9f9', 
                    borderRadius: 8, 
                    marginBottom: 8 
                  }}
                  onPress={() => addProductWithFormat(showFormatSelector, format)}
                >
                  <Text style={{ fontWeight: '500', color: '#333' }}>{format.name}</Text>
                  <Text style={{ fontWeight: '600', color: primaryColor }}>
                    {(format.selling_price || format.price || 0).toFixed(2)}€
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Invoice/Quote PDF Preview Modal */}
      <Modal visible={showInvoicePdfModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 10 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, width: '100%', maxWidth: 900, height: '95%', overflow: 'hidden' }}>
            {/* Header with buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: primaryColor, borderBottomWidth: 1, borderBottomColor: '#333' }}>
              <TouchableOpacity 
                onPress={closeInvoicePdfModal}
                style={{ backgroundColor: '#666', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                data-testid="invoice-pdf-back-btn"
              >
                <Text style={{ color: 'white', fontSize: 18 }}>←</Text>
                <Text style={{ color: 'white', fontWeight: '600' }}>Retour</Text>
              </TouchableOpacity>
              <Text style={{ color: secondaryColor, fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'center' }}>
                {invoicePdfTitle}
              </Text>
              <TouchableOpacity 
                onPress={downloadInvoicePdfFromPreview}
                style={{ backgroundColor: '#27ae60', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                data-testid="invoice-pdf-download-btn"
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Télécharger</Text>
                <Text style={{ color: 'white', fontSize: 18 }}>⬇</Text>
              </TouchableOpacity>
            </View>
            {/* PDF Viewer */}
            <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
              {invoicePdfUrl ? (
                <iframe
                  src={invoicePdfUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={invoicePdfTitle}
                />
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <Text style={{ marginTop: 16, color: '#666' }}>Chargement du PDF...</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

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
