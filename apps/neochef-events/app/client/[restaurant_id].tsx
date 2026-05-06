import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, Linking, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebIcon } from '../components/WebIcon';
import { Platform } from 'react-native';
import { Wifi as LucideWifi, Facebook as LucideFacebook, Instagram as LucideInstagram, ShoppingCart as LucideShoppingCart, X as LucideX, Check as LucideCheck, Plus as LucidePlus, Minus as LucideMinus, ChevronRight as LucideChevronRight, ChevronUp as LucideChevronUp, ChevronDown as LucideChevronDown, AlertCircle as LucideAlertCircle, ArrowLeft as LucideArrowLeft } from 'lucide-react';
import { Wifi as WebWifi, Facebook as WebFacebook, Instagram as WebInstagram, ShoppingCart as WebShoppingCart, X as WebX, Check as WebCheck, Plus as WebPlus, Minus as WebMinus, ChevronRight as WebChevronRight, ChevronUp as WebChevronUp, ChevronDown as WebChevronDown, AlertCircle as WebAlertCircle, ArrowLeft as WebArrowLeft } from '../components/LucideWebIcon';

// Use web icons on web platform, lucide-react on native
const Wifi = Platform.OS === 'web' ? WebWifi : LucideWifi;
const Facebook = Platform.OS === 'web' ? WebFacebook : LucideFacebook;
const Instagram = Platform.OS === 'web' ? WebInstagram : LucideInstagram;
const ShoppingCart = Platform.OS === 'web' ? WebShoppingCart : LucideShoppingCart;
const X = Platform.OS === 'web' ? WebX : LucideX;
const Check = Platform.OS === 'web' ? WebCheck : LucideCheck;
const Plus = Platform.OS === 'web' ? WebPlus : LucidePlus;
const Minus = Platform.OS === 'web' ? WebMinus : LucideMinus;
const ChevronRight = Platform.OS === 'web' ? WebChevronRight : LucideChevronRight;
const ChevronUp = Platform.OS === 'web' ? WebChevronUp : LucideChevronUp;
const ChevronDown = Platform.OS === 'web' ? WebChevronDown : LucideChevronDown;
const AlertCircle = Platform.OS === 'web' ? WebAlertCircle : LucideAlertCircle;
const ArrowLeft = Platform.OS === 'web' ? WebArrowLeft : LucideArrowLeft;

// Get the API URL dynamically for web (uses current origin)
const getApiUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
};
const API_URL = getApiUrl();

// Types
interface MenuItem {
  item_id: string;
  name: string;
  originalName?: string; // Original French name (for order ticket)
  descriptions?: string[];
  price?: number;
  formats?: { name: string; price: number; happy_hour_price?: number }[];
  allergens?: string[];
  tags?: string[];
  section_id: string;
  cooking_options?: string[]; // Options de cuisson (Bleu, Saignant, etc.)
  requires_cooking_choice?: boolean; // Si true, demander la cuisson
}

interface Section {
  section_id: string;
  name: string;
  color?: string;
  parent_section_id?: string;
  menu_type: string;
}

interface CartItem {
  item_id: string;
  original_item_id: string; // Keep original item_id for translation lookup
  name: string;
  format_name?: string;
  price: number;
  quantity: number;
  composition?: { category: string; item_name: string; original_name?: string }[]; // For formules - original_name is always French
  cooking_option?: string; // Option de cuisson choisie (Bleu, Saignant, etc.)
}

// Interface for formule composition
interface FormuleComposition {
  formule: MenuItem;
  requiredCategories: string[];
  selectedItems: { [category: string]: MenuItem | null };
}

interface Restaurant {
  restaurant_id: string;
  name: string;
  logo_base64?: string;
  primary_color: string;
  secondary_color: string;
  address_street?: string;
  address_postal_code?: string;
  address_city?: string;
  email?: string;
  phone?: string;
  facebook_url?: string;
  instagram_url?: string;
  wifi_name?: string;
  wifi_password?: string;
  happy_hour_enabled?: boolean;
  happy_hour_start?: string;
  happy_hour_end?: string;
}

// Type pour l'ardoise (plats du jour)
interface ArdoiseItem {
  name: string;
  description: string;
  price: number | null;
}

interface ArdoiseData {
  entree: ArdoiseItem[];
  plat: ArdoiseItem[];
  dessert: ArdoiseItem[];
}

// Liste des allergènes
const ALLERGENS = [
  { id: 'gluten', name: 'Gluten', emoji: '🌾' },
  { id: 'crustaces', name: 'Crustacés', emoji: '🦐' },
  { id: 'oeufs', name: 'Oeufs', emoji: '🥚' },
  { id: 'poissons', name: 'Poissons', emoji: '🐟' },
  { id: 'arachides', name: 'Arachides', emoji: '🥜' },
  { id: 'soja', name: 'Soja', emoji: '🫘' },
  { id: 'lait', name: 'Lait', emoji: '🥛' },
  { id: 'fruits_coques', name: 'Fruits à coques', emoji: '🌰' },
  { id: 'celeri', name: 'Céleri', emoji: '🥬' },
  { id: 'moutarde', name: 'Moutarde', emoji: '🟡' },
  { id: 'sesame', name: 'Sésame', emoji: '⚪' },
  { id: 'sulfites', name: 'Sulfites', emoji: '🍷' },
  { id: 'lupin', name: 'Lupin', emoji: '🌸' },
  { id: 'mollusques', name: 'Mollusques', emoji: '🦪' },
];

// QR Code Display Component - creates order and shows QR with short URL
const QRCodeDisplay = ({ cart, restaurant, cartTotal, primaryColor }: { 
  cart: CartItem[], 
  restaurant: Restaurant | null, 
  cartTotal: number,
  primaryColor: string 
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const createOrder = async () => {
      try {
        // Create order on server
        const response = await fetch(`${API_URL}/api/public/order/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant: restaurant?.name || 'Restaurant',
            items: cart.map(item => ({
              name: item.name,
              qty: item.quantity,
              price: item.price * item.quantity,
              format: item.format_name || '',
              comp: item.composition?.map(c => `${c.category}: ${c.item_name}`) || [],
              cooking_option: item.cooking_option || null
            })),
            total: cartTotal
          })
        });
        
        const data = await response.json();
        const orderId = data.order_id;
        
        // Create QR code with short URL
        const ticketUrl = `${API_URL}/api/public/order/${orderId}`;
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&margin=10&data=${encodeURIComponent(ticketUrl)}`;
        setQrUrl(qrImageUrl);
      } catch (error) {
        console.error('Error creating order:', error);
        // Fallback to simple text QR
        const simpleData = cart.map(item => `${item.quantity}x ${item.name}`).join('\n') + `\nTOTAL: ${cartTotal.toFixed(2)}€`;
        setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&data=${encodeURIComponent(simpleData)}`);
      }
      setLoading(false);
    };
    
    createOrder();
  }, [cart, restaurant, cartTotal]);

  if (loading) {
    return <ActivityIndicator size="large" color={primaryColor} />;
  }

  return (
    <Image 
      source={{ uri: qrUrl }}
      style={{ width: 220, height: 220 }}
      resizeMode="contain"
    />
  );
};

export default function ClientMenuPage() {
  const { restaurant_id } = useLocalSearchParams<{ restaurant_id: string }>();
  
  // States
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [ardoiseData, setArdoiseData] = useState<ArdoiseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Menu type (food/boisson)
  const [currentTab, setCurrentTab] = useState<'food' | 'boisson'>('food');
  
  // Language/Translation
  const [currentLanguage, setCurrentLanguage] = useState<string>('fr');
  const [translatedItems, setTranslatedItems] = useState<{[key: string]: {name: string, descriptions: string[]}}>({}); 
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedSections, setTranslatedSections] = useState<{[key: string]: string}>({});
  const [translatedArdoise, setTranslatedArdoise] = useState<{[key: string]: string}>({});
  
  const LANGUAGES = [
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
  ];
  
  // UI translations for different languages
  const UI_TRANSLATIONS: {[lang: string]: {[key: string]: string}} = {
    fr: {
      carte_food: 'Carte Food',
      carte_boisson: 'Carte Boisson',
      filter_allergens: 'Filtrer par allergènes',
      your_cart: 'Votre panier',
      validate_order: 'Valider la commande',
      total: 'Total',
      choose_size: 'Choisissez la taille :',
      small: 'Petite',
      large: 'Grande',
      cancel: 'Annuler',
      compose_formula: 'Composez votre formule',
      add_to_cart: 'Ajouter au panier',
      wifi: 'WiFi',
      password: 'Mot de passe',
      happy_hour: 'HAPPY HOUR EN COURS !',
      loading: 'Chargement du menu...',
      no_choice: 'Aucun choix disponible',
      ardoise_note: 'Uniquement midi, lundi au vendredi, hors jour férié',
      menu_enfant_note: 'Pour les enfants jusqu\'à 12 ans',
      order_ready: 'Commande prête !',
      show_to_server: 'Montrez ce récapitulatif au serveur',
      modify: 'Modifier',
      done: 'Terminé',
      cooking_choice: 'Choix de cuisson',
      cooking_for: 'Pour',
      cooking_bleu: 'Bleu',
      cooking_saignant: 'Saignant',
      cooking_a_point: 'À point',
      cooking_bien_cuit: 'Bien cuit',
    },
    en: {
      carte_food: 'Food Menu',
      carte_boisson: 'Drink Menu',
      filter_allergens: 'Filter by allergens',
      your_cart: 'Your cart',
      validate_order: 'Validate order',
      total: 'Total',
      choose_size: 'Choose your size:',
      small: 'Small',
      large: 'Large',
      cancel: 'Cancel',
      compose_formula: 'Compose your formula',
      add_to_cart: 'Add to cart',
      wifi: 'WiFi',
      password: 'Password',
      happy_hour: 'HAPPY HOUR IN PROGRESS!',
      loading: 'Loading menu...',
      no_choice: 'No choice available',
      ardoise_note: 'Lunch only, Monday to Friday, excluding holidays',
      menu_enfant_note: 'For children up to 12 years old',
      order_ready: 'Order ready!',
      show_to_server: 'Show this summary to the waiter',
      modify: 'Modify',
      done: 'Done',
      cooking_choice: 'Cooking preference',
      cooking_for: 'For',
      cooking_bleu: 'Blue rare',
      cooking_saignant: 'Rare',
      cooking_a_point: 'Medium',
      cooking_bien_cuit: 'Well done',
    },
    es: {
      carte_food: 'Carta de Comidas',
      carte_boisson: 'Carta de Bebidas',
      filter_allergens: 'Filtrar por alérgenos',
      your_cart: 'Tu carrito',
      validate_order: 'Validar pedido',
      total: 'Total',
      choose_size: 'Elige tu tamaño:',
      small: 'Pequeña',
      large: 'Grande',
      cancel: 'Cancelar',
      compose_formula: 'Compón tu menú',
      add_to_cart: 'Añadir al carrito',
      wifi: 'WiFi',
      password: 'Contraseña',
      happy_hour: '¡HAPPY HOUR EN CURSO!',
      loading: 'Cargando menú...',
      no_choice: 'Sin opciones disponibles',
      ardoise_note: 'Solo almuerzo, de lunes a viernes, excepto festivos',
      menu_enfant_note: 'Para niños hasta 12 años',
    },
    de: {
      carte_food: 'Speisekarte',
      carte_boisson: 'Getränkekarte',
      filter_allergens: 'Nach Allergenen filtern',
      your_cart: 'Ihr Warenkorb',
      validate_order: 'Bestellung bestätigen',
      total: 'Gesamt',
      choose_size: 'Wählen Sie Ihre Größe:',
      small: 'Klein',
      large: 'Groß',
      cancel: 'Abbrechen',
      compose_formula: 'Stellen Sie Ihr Menü zusammen',
      add_to_cart: 'In den Warenkorb',
      wifi: 'WLAN',
      password: 'Passwort',
      happy_hour: 'HAPPY HOUR LÄUFT!',
      loading: 'Menü wird geladen...',
      no_choice: 'Keine Auswahl verfügbar',
      ardoise_note: 'Nur mittags, Montag bis Freitag, außer feiertags',
      menu_enfant_note: 'Für Kinder bis 12 Jahre',
    },
    it: {
      carte_food: 'Menu Cibo',
      carte_boisson: 'Menu Bevande',
      filter_allergens: 'Filtra per allergeni',
      your_cart: 'Il tuo carrello',
      validate_order: 'Conferma ordine',
      total: 'Totale',
      choose_size: 'Scegli la dimensione:',
      small: 'Piccola',
      large: 'Grande',
      cancel: 'Annulla',
      compose_formula: 'Componi il tuo menu',
      add_to_cart: 'Aggiungi al carrello',
      wifi: 'WiFi',
      password: 'Password',
      happy_hour: 'HAPPY HOUR IN CORSO!',
      loading: 'Caricamento menu...',
      no_choice: 'Nessuna scelta disponibile',
      ardoise_note: 'Solo pranzo, dal lunedì al venerdì, esclusi festivi',
      menu_enfant_note: 'Per bambini fino a 12 anni',
    },
    zh: {
      carte_food: '美食菜单',
      carte_boisson: '饮品菜单',
      filter_allergens: '按过敏原筛选',
      your_cart: '您的购物车',
      validate_order: '确认订单',
      total: '总计',
      choose_size: '选择份量：',
      small: '小份',
      large: '大份',
      cancel: '取消',
      compose_formula: '自选套餐',
      add_to_cart: '加入购物车',
      wifi: 'WiFi',
      password: '密码',
      happy_hour: '欢乐时光进行中！',
      loading: '正在加载菜单...',
      no_choice: '无可选项',
      ardoise_note: '仅限午餐，周一至周五，节假日除外',
      menu_enfant_note: '适合12岁以下儿童',
    },
    ru: {
      carte_food: 'Меню блюд',
      carte_boisson: 'Меню напитков',
      filter_allergens: 'Фильтр по аллергенам',
      your_cart: 'Ваша корзина',
      validate_order: 'Подтвердить заказ',
      total: 'Итого',
      choose_size: 'Выберите размер:',
      small: 'Маленькая',
      large: 'Большая',
      cancel: 'Отмена',
      compose_formula: 'Составьте ваш сет',
      add_to_cart: 'Добавить в корзину',
      wifi: 'WiFi',
      password: 'Пароль',
      happy_hour: 'СЧАСТЛИВЫЙ ЧАС!',
      loading: 'Загрузка меню...',
      no_choice: 'Нет вариантов',
      ardoise_note: 'Только обед, с понедельника по пятницу, кроме праздников',
      menu_enfant_note: 'Для детей до 12 лет',
    },
    pt: {
      carte_food: 'Cardápio de Comidas',
      carte_boisson: 'Cardápio de Bebidas',
      filter_allergens: 'Filtrar por alérgenos',
      your_cart: 'Seu carrinho',
      validate_order: 'Confirmar pedido',
      total: 'Total',
      choose_size: 'Escolha o tamanho:',
      small: 'Pequena',
      large: 'Grande',
      cancel: 'Cancelar',
      compose_formula: 'Monte seu menu',
      add_to_cart: 'Adicionar ao carrinho',
      wifi: 'WiFi',
      password: 'Senha',
      happy_hour: 'HAPPY HOUR EM ANDAMENTO!',
      loading: 'Carregando cardápio...',
      no_choice: 'Sem opções disponíveis',
      selected: 'Selecionado',
      to_select: 'Selecionar',
      select_all_elements: 'Selecione todos os elementos',
      compose_formula_desc: 'Componha seu menu selecionando um item de cada categoria:',
      exclude_dishes: 'Excluir pratos contendo:',
      apply: 'Aplicar',
      ardoise_note: 'Apenas almoço, de segunda a sexta, exceto feriados',
      menu_enfant_note: 'Para crianças até 12 anos',
    },
  };
  
  // Add additional translations to existing languages
  UI_TRANSLATIONS['fr'] = { ...UI_TRANSLATIONS['fr'], 
    selected: 'Sélectionné', 
    to_select: 'À sélectionner',
    select_all_elements: 'Sélectionnez tous les éléments',
    compose_formula_desc: 'Composez votre formule en sélectionnant un élément dans chaque catégorie :',
    exclude_dishes: 'Exclure les plats contenant :',
    apply: 'Appliquer',
  };
  UI_TRANSLATIONS['en'] = { ...UI_TRANSLATIONS['en'], 
    selected: 'Selected', 
    to_select: 'To select',
    select_all_elements: 'Select all elements',
    compose_formula_desc: 'Compose your formula by selecting one item from each category:',
    exclude_dishes: 'Exclude dishes containing:',
    apply: 'Apply',
  };
  UI_TRANSLATIONS['es'] = { ...UI_TRANSLATIONS['es'], 
    selected: 'Seleccionado', 
    to_select: 'Por seleccionar',
    select_all_elements: 'Seleccione todos los elementos',
    compose_formula_desc: 'Componga su menú seleccionando un elemento de cada categoría:',
    exclude_dishes: 'Excluir platos que contienen:',
    apply: 'Aplicar',
    order_ready: '¡Pedido listo!',
    show_to_server: 'Muestre este resumen al camarero',
    modify: 'Modificar',
    done: 'Hecho',
  };
  UI_TRANSLATIONS['de'] = { ...UI_TRANSLATIONS['de'], 
    selected: 'Ausgewählt', 
    to_select: 'Auswählen',
    select_all_elements: 'Alle Elemente auswählen',
    compose_formula_desc: 'Stellen Sie Ihr Menü zusammen, indem Sie ein Element aus jeder Kategorie wählen:',
    exclude_dishes: 'Gerichte ausschließen mit:',
    apply: 'Anwenden',
    order_ready: 'Bestellung fertig!',
    show_to_server: 'Zeigen Sie diese Zusammenfassung dem Kellner',
    modify: 'Ändern',
    done: 'Fertig',
  };
  UI_TRANSLATIONS['it'] = { ...UI_TRANSLATIONS['it'], 
    selected: 'Selezionato', 
    to_select: 'Da selezionare',
    select_all_elements: 'Seleziona tutti gli elementi',
    compose_formula_desc: 'Componi il tuo menu selezionando un elemento da ogni categoria:',
    exclude_dishes: 'Escludere piatti contenenti:',
    apply: 'Applica',
    order_ready: 'Ordine pronto!',
    show_to_server: 'Mostra questo riepilogo al cameriere',
    modify: 'Modifica',
    done: 'Fatto',
  };
  UI_TRANSLATIONS['zh'] = { ...UI_TRANSLATIONS['zh'], 
    selected: '已选择', 
    to_select: '待选择',
    select_all_elements: '选择所有元素',
    compose_formula_desc: '请从每个类别中选择一项组成您的套餐：',
    exclude_dishes: '排除含有以下成分的菜品：',
    apply: '应用',
    order_ready: '订单准备好了！',
    show_to_server: '请向服务员出示此订单',
    modify: '修改',
    done: '完成',
  };
  UI_TRANSLATIONS['ru'] = { ...UI_TRANSLATIONS['ru'], 
    selected: 'Выбрано', 
    to_select: 'Выбрать',
    select_all_elements: 'Выберите все элементы',
    compose_formula_desc: 'Составьте ваш сет, выбрав по одному элементу из каждой категории:',
    exclude_dishes: 'Исключить блюда, содержащие:',
    apply: 'Применить',
    order_ready: 'Заказ готов!',
    show_to_server: 'Покажите это официанту',
    modify: 'Изменить',
    done: 'Готово',
  };
  
  // Allergen translations
  const ALLERGEN_TRANSLATIONS: {[lang: string]: {[key: string]: string}} = {
    fr: { gluten: 'Gluten', crustaces: 'Crustacés', oeufs: 'Œufs', poissons: 'Poissons', arachides: 'Arachides', soja: 'Soja', lait: 'Lait', fruits_coques: 'Fruits à coques', celeri: 'Céleri', moutarde: 'Moutarde', sesame: 'Sésame', sulfites: 'Sulfites', lupin: 'Lupin', mollusques: 'Mollusques' },
    en: { gluten: 'Gluten', crustaces: 'Crustaceans', oeufs: 'Eggs', poissons: 'Fish', arachides: 'Peanuts', soja: 'Soy', lait: 'Milk', fruits_coques: 'Tree nuts', celeri: 'Celery', moutarde: 'Mustard', sesame: 'Sesame', sulfites: 'Sulfites', lupin: 'Lupin', mollusques: 'Mollusks' },
    es: { gluten: 'Gluten', crustaces: 'Crustáceos', oeufs: 'Huevos', poissons: 'Pescado', arachides: 'Cacahuetes', soja: 'Soja', lait: 'Leche', fruits_coques: 'Frutos secos', celeri: 'Apio', moutarde: 'Mostaza', sesame: 'Sésamo', sulfites: 'Sulfitos', lupin: 'Altramuces', mollusques: 'Moluscos' },
    de: { gluten: 'Gluten', crustaces: 'Krebstiere', oeufs: 'Eier', poissons: 'Fisch', arachides: 'Erdnüsse', soja: 'Soja', lait: 'Milch', fruits_coques: 'Schalenfrüchte', celeri: 'Sellerie', moutarde: 'Senf', sesame: 'Sesam', sulfites: 'Sulfite', lupin: 'Lupinen', mollusques: 'Weichtiere' },
    it: { gluten: 'Glutine', crustaces: 'Crostacei', oeufs: 'Uova', poissons: 'Pesce', arachides: 'Arachidi', soja: 'Soia', lait: 'Latte', fruits_coques: 'Frutta a guscio', celeri: 'Sedano', moutarde: 'Senape', sesame: 'Sesamo', sulfites: 'Solfiti', lupin: 'Lupini', mollusques: 'Molluschi' },
    zh: { gluten: '麸质', crustaces: '甲壳类', oeufs: '鸡蛋', poissons: '鱼', arachides: '花生', soja: '大豆', lait: '牛奶', fruits_coques: '坚果', celeri: '芹菜', moutarde: '芥末', sesame: '芝麻', sulfites: '亚硫酸盐', lupin: '羽扇豆', mollusques: '软体动物' },
    ru: { gluten: 'Глютен', crustaces: 'Ракообразные', oeufs: 'Яйца', poissons: 'Рыба', arachides: 'Арахис', soja: 'Соя', lait: 'Молоко', fruits_coques: 'Орехи', celeri: 'Сельдерей', moutarde: 'Горчица', sesame: 'Кунжут', sulfites: 'Сульфиты', lupin: 'Люпин', mollusques: 'Моллюски' },
    pt: { gluten: 'Glúten', crustaces: 'Crustáceos', oeufs: 'Ovos', poissons: 'Peixe', arachides: 'Amendoins', soja: 'Soja', lait: 'Leite', fruits_coques: 'Frutos de casca rija', celeri: 'Aipo', moutarde: 'Mostarda', sesame: 'Sésamo', sulfites: 'Sulfitos', lupin: 'Tremoços', mollusques: 'Moluscos' },
  };
  
  // Category translations (for formule modal)
  const CATEGORY_TRANSLATIONS: {[lang: string]: {[key: string]: string}} = {
    fr: { entree: 'Entrée', plat: 'Plat', dessert: 'Dessert', boisson: 'Boisson' },
    en: { entree: 'Starter', plat: 'Main course', dessert: 'Dessert', boisson: 'Drink' },
    es: { entree: 'Entrante', plat: 'Plato principal', dessert: 'Postre', boisson: 'Bebida' },
    de: { entree: 'Vorspeise', plat: 'Hauptgericht', dessert: 'Nachtisch', boisson: 'Getränk' },
    it: { entree: 'Antipasto', plat: 'Piatto principale', dessert: 'Dolce', boisson: 'Bevanda' },
    zh: { entree: '前菜', plat: '主菜', dessert: '甜点', boisson: '饮品' },
    ru: { entree: 'Закуска', plat: 'Основное блюдо', dessert: 'Десерт', boisson: 'Напиток' },
    pt: { entree: 'Entrada', plat: 'Prato principal', dessert: 'Sobremesa', boisson: 'Bebida' },
  };
  
  // Translate allergen name using the allergen ID
  const translateAllergen = (allergenName: string): string => {
    // Find the allergen by name to get its ID
    const allergen = ALLERGENS.find(a => a.name === allergenName);
    if (allergen) {
      return ALLERGEN_TRANSLATIONS[currentLanguage]?.[allergen.id] || allergenName;
    }
    return allergenName;
  };
  
  // Translate category name
  const translateCategory = (category: string): string => {
    const key = category.toLowerCase().replace(/[éè]/g, 'e');
    return CATEGORY_TRANSLATIONS[currentLanguage]?.[key] || CATEGORY_TRANSLATIONS['fr']?.[key] || category;
  };
  
  // Helper to get translated UI text
  const t = (key: string): string => {
    return UI_TRANSLATIONS[currentLanguage]?.[key] || UI_TRANSLATIONS['fr'][key] || key;
  };
  
  // Translate cooking options
  const translateCookingOption = (option: string): string => {
    const cookingMap: {[key: string]: string} = {
      'Bleu': t('cooking_bleu'),
      'Saignant': t('cooking_saignant'),
      'À point': t('cooking_a_point'),
      'A point': t('cooking_a_point'),
      'Bien cuit': t('cooking_bien_cuit'),
    };
    return cookingMap[option] || option;
  };
  
  // Get translated section name
  const getTranslatedSectionName = (section: Section): string => {
    if (currentLanguage === 'fr') return section.name;
    return translatedSections[section.section_id] || section.name;
  };
  
  // Allergen filter
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [showAllergenModal, setShowAllergenModal] = useState(false);
  
  // Language dropdown
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  
  // Pre-loaded translations from database
  const [cachedTranslations, setCachedTranslations] = useState<{[lang: string]: {[key: string]: string}}>({});
  const cachedTranslationsRef = useRef<{[lang: string]: {[key: string]: string}}>({});
  
  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showOrderSummary, setShowOrderSummary] = useState(false);
  
  // Format selection modal
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [showFormatModal, setShowFormatModal] = useState(false);
  
  // Cooking option modal
  const [showCookingModal, setShowCookingModal] = useState(false);
  const [pendingCookingItem, setPendingCookingItem] = useState<{item: MenuItem; formatName?: string; price?: number} | null>(null);
  
  // Formule composition modal
  const [showFormuleModal, setShowFormuleModal] = useState(false);
  const [formuleComposition, setFormuleComposition] = useState<FormuleComposition | null>(null);
  
  // Helper functions for formules
  const isFormule = (item: MenuItem): boolean => {
    // A formule contains "+" in the name and has a price
    // OR it's a "Menu Enfant" type item with categories in descriptions
    // OR it's "Plat du jour" in A L'ARDOISE section (needs plat selection)
    const hasPlus = item.name.includes('+') && (item.price !== undefined && item.price !== null);
    const isMenuEnfant = item.name.toLowerCase().includes('menu enfant') && (item.price !== undefined && item.price !== null);
    return hasPlus || isMenuEnfant;
  };
  
  // Check if item is "Plat du jour" in A L'ARDOISE section
  const isPlatDuJour = (item: MenuItem): boolean => {
    if (!item.name.toLowerCase().includes('plat du jour')) return false;
    if (item.price === undefined || item.price === null) return false;
    // Check if in A L'ARDOISE section
    const section = sections.find(s => s.section_id === item.section_id);
    return section?.name.toUpperCase().includes('ARDOISE') || false;
  };
  
  // Check if item has category descriptions like "Boisson: X / Y / Z" or "Dessert: X ou Y"
  const hasCompositionDescriptions = (item: MenuItem): boolean => {
    if (!item.descriptions || item.descriptions.length === 0) return false;
    return item.descriptions.some(d => d.includes(':') && (d.includes('/') || d.toLowerCase().includes(' ou ')));
  };

  const isCategoryHeader = (item: MenuItem): boolean => {
    // Category headers like "Entrée", "Plat", "Dessert", "Boisson" have no price
    // They may have descriptions but no price/formats
    const categoryNames = ['entrée', 'plat', 'dessert', 'entree', 'boisson'];
    const itemNameLower = item.name.toLowerCase();
    const isNameMatch = categoryNames.includes(itemNameLower);
    const hasNoPrice = (item.price === null || item.price === undefined) && (!item.formats || item.formats.length === 0);
    return isNameMatch && hasNoPrice;
  };
  
  const isInFormuleSection = (section: Section): boolean => {
    // Check if this section is a formule-type section (MENU EXPRESS, A L'ARDOISE, MENU ENFANT)
    const sectionNameUpper = section.name.toUpperCase();
    return sectionNameUpper.includes('EXPRESS') || 
           sectionNameUpper.includes('ARDOISE') ||
           sectionNameUpper.includes('FORMULE') ||
           sectionNameUpper.includes('ENFANT');
  };
  
  const getFormuleCategories = (item: MenuItem): string[] => {
    // First check if item has composition descriptions like "Boisson: X / Y / Z" or "Dessert: X ou Y"
    if (item.descriptions && item.descriptions.length > 0) {
      const categories: string[] = [];
      item.descriptions.forEach(desc => {
        // Check if this description defines a category with options
        if (desc.includes(':')) {
          const parts = desc.split(':');
          const categoryName = parts[0].trim();
          const optionsPart = parts[1] || '';
          
          // Category is valid if it has a name (no dots) and has options (/ or ou separators)
          const hasOptions = optionsPart.includes('/') || optionsPart.toLowerCase().includes(' ou ');
          const isValidCategory = categoryName && !categoryName.includes('.') && categoryName.length < 20;
          
          if (isValidCategory && hasOptions) {
            categories.push(categoryName);
          }
        }
      });
      if (categories.length > 0) return categories;
    }
    
    // First, parse categories from the formule name to know what we need
    const nameLower = item.name.toLowerCase();
    const requiredFromName: string[] = [];
    if (nameLower.includes('entr') || nameLower.includes('entree')) requiredFromName.push('entrée');
    if (nameLower.includes('plat')) requiredFromName.push('plat');
    if (nameLower.includes('dessert')) requiredFromName.push('dessert');
    if (nameLower.includes('boisson')) requiredFromName.push('boisson');
    
    // SPECIAL CASE: For "Menu Enfant" type items (no "+" in name), get ALL categories in section
    const isMenuEnfantType = nameLower.includes('menu enfant') && !item.name.includes('+');
    
    // SPECIAL CASE: Check if there are separate category items in the same section (like Menu Enfant/Express)
    // These are items named "Boisson", "Plat", "Dessert" with descriptions but no price
    const sectionItems = items.filter(i => i.section_id === item.section_id);
    const allCategoryItems = sectionItems.filter(i => {
      const catNameLower = i.name.toLowerCase();
      const isCategoryName = ['boisson', 'plat', 'dessert', 'entrée', 'entree'].includes(catNameLower);
      const hasDescriptions = i.descriptions && i.descriptions.length > 0;
      const noPrice = i.price === undefined || i.price === null;
      return isCategoryName && hasDescriptions && noPrice;
    });
    
    if (allCategoryItems.length > 0) {
      // For "Menu Enfant" without "+", return ALL category items found in section
      if (isMenuEnfantType) {
        return allCategoryItems.map(ci => ci.name.charAt(0).toUpperCase() + ci.name.slice(1).toLowerCase());
      }
      
      // For formules with "+", filter category items to only include those that match the formule name
      // e.g., "Plat + Dessert" should only return Plat and Dessert, not Entrée
      const filteredCategories = allCategoryItems.filter(ci => {
        const catNameLower = ci.name.toLowerCase().replace('é', 'e');
        // Check if this category is mentioned in the formule name
        return requiredFromName.some(req => req.replace('é', 'e') === catNameLower);
      });
      
      if (filteredCategories.length > 0) {
        return filteredCategories.map(ci => ci.name.charAt(0).toUpperCase() + ci.name.slice(1).toLowerCase());
      }
    }
    
    // Fall back to parsed categories from formule name
    const categories: string[] = [];
    if (requiredFromName.includes('entrée')) categories.push('Entrée');
    if (requiredFromName.includes('plat')) categories.push('Plat');
    if (requiredFromName.includes('dessert')) categories.push('Dessert');
    if (requiredFromName.includes('boisson')) categories.push('Boisson');
    return categories;
  };
  
  const getCategoryItems = (categoryName: string, sectionId: string, formuleItem?: MenuItem): MenuItem[] => {
    const categoryNameLower = categoryName.toLowerCase();
    const categoryNameNoAccent = categoryNameLower.replace('é', 'e');
    
    // Check if this is an A L'ARDOISE section
    const currentSection = sections.find(s => s.section_id === sectionId);
    const isArdoiseSection = currentSection?.name.toUpperCase().includes('ARDOISE');
    
    // SPECIAL CASE: For A L'ARDOISE formules, use ardoise data
    if (isArdoiseSection && ardoiseData) {
      let ardoiseItems: ArdoiseItem[] = [];
      let ardoiseCat = '';
      if (categoryNameLower === 'entrée' || categoryNameLower === 'entree') {
        ardoiseItems = ardoiseData.entree || [];
        ardoiseCat = 'entree';
      } else if (categoryNameLower === 'plat') {
        ardoiseItems = ardoiseData.plat || [];
        ardoiseCat = 'plat';
      } else if (categoryNameLower === 'dessert') {
        ardoiseItems = ardoiseData.dessert || [];
        ardoiseCat = 'dessert';
      }
      
      // Filter out empty items BUT preserve original index for translation keys
      const result: MenuItem[] = [];
      ardoiseItems.forEach((item, originalIdx) => {
        if (item.name && item.name.trim()) {
          result.push({
            item_id: `ardoise_${ardoiseCat}_${originalIdx}`,
            name: item.name, // This is already French (original)
            originalName: item.name, // Store French name explicitly
            descriptions: item.description ? [item.description] : [],
            section_id: sectionId,
            price: item.price || 0
          } as MenuItem);
        }
      });
      
      if (result.length > 0) {
        return result;
      }
    }
    
    // SPECIAL CASE: If the formule item has composition descriptions like "Boisson: X / Y / Z"
    // Parse options directly from the formule's descriptions
    if (formuleItem && hasCompositionDescriptions(formuleItem)) {
      const matchingDesc = formuleItem.descriptions?.find(d => {
        const descCategoryName = d.split(':')[0].trim().toLowerCase();
        return descCategoryName === categoryNameLower || descCategoryName === categoryNameNoAccent;
      });
      
      if (matchingDesc) {
        const optionsPart = matchingDesc.split(':')[1];
        if (optionsPart) {
          // Support both "/" and "ou" as separators
          let options: string[];
          if (optionsPart.includes('/')) {
            options = optionsPart.split('/').map(o => o.trim()).filter(o => o && !o.includes('.'));
          } else if (optionsPart.toLowerCase().includes(' ou ')) {
            options = optionsPart.split(/\s+ou\s+/i).map(o => o.trim()).filter(o => o && !o.includes('.'));
          } else {
            // Single option
            options = [optionsPart.trim()].filter(o => o && !o.includes('.'));
          }
          return options.map((opt, idx) => ({
            item_id: `${formuleItem.item_id}_${categoryName}_${idx}`,
            name: opt,
            originalName: opt, // Store French name (options from descriptions are always French)
            section_id: sectionId,
            price: 0
          } as MenuItem));
        }
      }
    }
    
    // Helper function to find category items in a specific section
    const findInSection = (targetSectionId: string): MenuItem[] => {
      // Get items in the main section first
      const sectionItems = items.filter(i => i.section_id === targetSectionId);
      
      // PRIORITY 1: Find the category header item with descriptions (like "Entrée" with description list)
      const categoryItem = sectionItems.find(i => {
        const itemNameLower = i.name.toLowerCase();
        return (itemNameLower === categoryNameLower || itemNameLower === categoryNameNoAccent) &&
               i.descriptions && i.descriptions.length > 0;
      });
      
      // If the category header has descriptions, create a selectable option for EACH description
      if (categoryItem && categoryItem.descriptions && categoryItem.descriptions.length > 0) {
        // Get original descriptions (French) 
        const originalDescriptions = categoryItem.descriptions || [];
        // Get translated descriptions for display
        const translatedDescriptions = getTranslatedDescriptions(categoryItem);
        return translatedDescriptions.map((desc, idx) => ({
          item_id: `${categoryItem.item_id}_${idx}`,
          name: desc,
          originalName: originalDescriptions[idx] || desc, // Store original French name
          descriptions: [], // Clear descriptions to avoid showing duplicates in modal
          section_id: categoryItem.section_id,
          price: 0 // Price is included in the formule
        }));
      }
      
      // PRIORITY 2: Look for subsections named like the category (only if they have items)
      const subSection = sections.find(s => 
        s.parent_section_id === targetSectionId && 
        s.name.toLowerCase().includes(categoryNameLower)
      );
      
      if (subSection) {
        const subItems = items.filter(i => i.section_id === subSection.section_id && i.price !== undefined && i.price !== null);
        if (subItems.length > 0) {
          return subItems;
        }
      }
      
      // PRIORITY 3: Look for items after the category header in the section
      const categoryIndex = sectionItems.findIndex(i => {
        const itemNameLower = i.name.toLowerCase();
        return itemNameLower === categoryNameLower || itemNameLower === categoryNameNoAccent;
      });
      
      if (categoryIndex === -1) return [];
      
      // Find items between this category and the next one
      const categoryNamesLower = ['entrée', 'entree', 'plat', 'dessert', 'boisson'];
      const result: MenuItem[] = [];
      for (let i = categoryIndex + 1; i < sectionItems.length; i++) {
        const item = sectionItems[i];
        // Stop if we hit another category header or a formule
        if (categoryNamesLower.includes(item.name.toLowerCase()) || isFormule(item)) break;
        // Include items with price OR items with descriptions (like daily specials)
        if (item.price !== undefined && item.price !== null) {
          result.push(item);
        } else if (item.descriptions && item.descriptions.length > 0) {
          // Item without price but with descriptions - create option for each
          item.descriptions.forEach((desc, idx) => {
            result.push({
              ...item,
              item_id: `${item.item_id}_${idx}`,
              name: desc,
              price: 0 // Included in formule price
            });
          });
        }
      }
      return result;
    };
    
    // Try to find in the formule's own section first
    let result = findInSection(sectionId);
    
    // If not found, search in other formule sections (MENU EXPRESS, A L'ARDOISE, etc.)
    if (result.length === 0) {
      const formuleSections = sections.filter(s => {
        const nameUpper = s.name.toUpperCase();
        return (nameUpper.includes('EXPRESS') || nameUpper.includes('ARDOISE') || nameUpper.includes('FORMULE'))
          && s.section_id !== sectionId; // Don't search the same section again
      });
      
      for (const formuleSec of formuleSections) {
        result = findInSection(formuleSec.section_id);
        if (result.length > 0) break;
      }
    }
    
    return result;
  };
  
  const handleFormuleClick = (item: MenuItem) => {
    const categories = getFormuleCategories(item);
    setFormuleComposition({
      formule: item,
      requiredCategories: categories,
      selectedItems: categories.reduce((acc, cat) => ({ ...acc, [cat]: null }), {})
    });
    setShowFormuleModal(true);
  };
  
  const handlePlatDuJourClick = (item: MenuItem) => {
    // Open the formule modal with only "Plat" category
    // This uses the plats from ardoiseData
    setFormuleComposition({
      formule: item,
      requiredCategories: ['Plat'],
      selectedItems: { 'Plat': null }
    });
    setShowFormuleModal(true);
  };
  
  const addFormuleToCart = () => {
    if (!formuleComposition) return;
    
    const { formule, selectedItems } = formuleComposition;
    const composition = Object.entries(selectedItems)
      .filter(([_, item]) => item !== null)
      .map(([category, item]) => ({ 
        category, 
        item_name: item!.originalName || item!.name, // Use original French name for ticket
        original_name: item!.originalName || item!.name // Always keep French name
      }));
    
    const cartItem: CartItem = {
      item_id: formule.item_id,
      original_item_id: formule.item_id, // Keep original for translation lookup
      name: formule.name,
      price: formule.price || 0,
      quantity: 1,
      composition
    };
    
    setCart([...cart, cartItem]);
    setShowFormuleModal(false);
    setFormuleComposition(null);
  };
  
  // Generate order summary for server (always in French)
  const generateOrderSummary = () => {
    let summary = `🍽️ COMMANDE\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    cart.forEach(item => {
      const formatText = item.format_name ? ` (${item.format_name})` : '';
      summary += `${item.quantity}x ${item.name}${formatText}\n`;
      if (item.composition && item.composition.length > 0) {
        item.composition.forEach(comp => {
          summary += `   • ${comp.category}: ${comp.item_name}\n`;
        });
      }
      summary += `   → ${(item.price * item.quantity).toFixed(2)}€\n\n`;
    });
    
    summary += `━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `TOTAL: ${cartTotal.toFixed(2)}€`;
    
    return summary;
  };

  // Happy Hour check
  const isHappyHour = () => {
    if (!restaurant?.happy_hour_enabled) return false;
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const start = restaurant.happy_hour_start || '17:00';
    const end = restaurant.happy_hour_end || '20:00';
    return currentTime >= start && currentTime <= end;
  };
  
  // Get price (with Happy Hour logic)
  const getPrice = (format: { price: number; happy_hour_price?: number }) => {
    if (isHappyHour() && format.happy_hour_price) {
      return format.happy_hour_price;
    }
    return format.price;
  };

  // Translation function - uses cached translations if available
  const translateMenu = async (targetLang: string) => {
    console.log('[translateMenu] Called with:', targetLang);
    
    if (targetLang === 'fr') {
      // Reset to original French
      setTranslatedItems({});
      setTranslatedSections({});
      setTranslatedArdoise({});
      setCurrentLanguage('fr');
      console.log('[translateMenu] Reset to French');
      return;
    }
    
    // Use ref for latest cached translations (avoids stale closure)
    let langTranslations = cachedTranslationsRef.current[targetLang];
    console.log('[translateMenu] Cached translations available:', !!langTranslations);
    
    // If not in cache, fetch directly
    if (!langTranslations) {
      try {
        console.log('[translateMenu] Fetching translations from API...');
        const transRes = await fetch(`${API_URL}/api/public/translations/${restaurant_id}`);
        if (transRes.ok) {
          const allTranslations = await transRes.json();
          console.log('[translateMenu] Got translations, languages:', Object.keys(allTranslations));
          setCachedTranslations(allTranslations);
          cachedTranslationsRef.current = allTranslations;
          langTranslations = allTranslations[targetLang];
        }
      } catch (e) {
        console.error('Error fetching translations:', e);
      }
    }
    
    // Check if we have translations for this language
    console.log('[translateMenu] langTranslations for', targetLang, ':', langTranslations ? Object.keys(langTranslations).length + ' keys' : 'null');
    
    if (langTranslations) {
      const newTranslatedItems: {[key: string]: {name: string, descriptions: string[]}} = {};
      const newTranslatedSections: {[key: string]: string} = {};
      const newTranslatedArdoise: {[key: string]: string} = {};
      
      // Translate sections
      sections.forEach(section => {
        const sectionKey = `section_${section.section_id}_name`;
        if (langTranslations[sectionKey]) {
          newTranslatedSections[section.section_id] = langTranslations[sectionKey];
          console.log('[translateMenu] Section translated:', section.name, '->', langTranslations[sectionKey]);
        } else {
          console.log('[translateMenu] Section NOT translated (key not found):', section.name, 'key:', sectionKey);
        }
      });
      
      // Translate items
      items.forEach(item => {
        const nameKey = `item_${item.item_id}_name`;
        const translatedName = langTranslations[nameKey] || item.name;
        
        const translatedDescs = (item.descriptions || []).map((desc, idx) => {
          const descKey = `item_${item.item_id}_description_${idx}`;
          return langTranslations[descKey] || desc;
        });
        
        newTranslatedItems[item.item_id] = {
          name: translatedName,
          descriptions: translatedDescs
        };
      });
      
      // Translate Ardoise items
      ['entree', 'plat', 'dessert'].forEach(category => {
        for (let i = 0; i < 10; i++) {
          const nameKey = `ardoise_${category}_${i}_name`;
          const descKey = `ardoise_${category}_${i}_description`;
          if (langTranslations[nameKey]) {
            newTranslatedArdoise[nameKey] = langTranslations[nameKey];
          }
          if (langTranslations[descKey]) {
            newTranslatedArdoise[descKey] = langTranslations[descKey];
          }
        }
      });
      
      setTranslatedSections(newTranslatedSections);
      setTranslatedItems(newTranslatedItems);
      setTranslatedArdoise(newTranslatedArdoise);
      setCurrentLanguage(targetLang);
      return;
    }
    
    // Fallback to API translation if no cached translations
    setIsTranslating(true);
    
    try {
      // Collect all texts to translate (section names, item names and descriptions)
      const textsToTranslate: string[] = [];
      const sectionMapping: { sectionId: string; index: number }[] = [];
      const itemMapping: { itemId: string; type: 'name' | 'desc'; descIndex?: number }[] = [];
      
      // First add section names
      sections.forEach(section => {
        sectionMapping.push({ sectionId: section.section_id, index: textsToTranslate.length });
        textsToTranslate.push(section.name);
      });
      
      // Then add items
      items.forEach(item => {
        // Add name
        textsToTranslate.push(item.name);
        itemMapping.push({ itemId: item.item_id, type: 'name' });
        
        // Add descriptions
        if (item.descriptions) {
          item.descriptions.forEach((desc, idx) => {
            textsToTranslate.push(desc);
            itemMapping.push({ itemId: item.item_id, type: 'desc', descIndex: idx });
          });
        }
      });
      
      // Batch translate (max 50 at a time to avoid timeouts)
      const batchSize = 50;
      const allTranslations: string[] = [];
      
      for (let i = 0; i < textsToTranslate.length; i += batchSize) {
        const batch = textsToTranslate.slice(i, i + batchSize);
        
        console.log(`[TRANSLATE] Sending batch ${i / batchSize + 1}: ${batch.length} texts`);
        
        const response = await fetch(`${API_URL}/api/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: batch,
            target_language: targetLang,
            source_language: 'fr'
          })
        });
        
        if (!response.ok) {
          console.error(`[TRANSLATE] API error: ${response.status}`);
          throw new Error(`Translation API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`[TRANSLATE] Received ${data.translations?.length || 0} translations`);
        
        if (data.error) {
          console.error(`[TRANSLATE] API returned error: ${data.error}`);
        }
        
        allTranslations.push(...(data.translations || batch));
      }
      
      // First extract section translations
      const newTranslatedSections: {[key: string]: string} = {};
      sectionMapping.forEach((mapping) => {
        const translation = allTranslations[mapping.index];
        if (translation) {
          newTranslatedSections[mapping.sectionId] = translation;
        }
      });
      
      // Build translated items map (skip section translations - they are at the beginning)
      const sectionCount = sectionMapping.length;
      const newTranslatedItems: {[key: string]: {name: string, descriptions: string[]}} = {};
      
      itemMapping.forEach((mapping, idx) => {
        const translation = allTranslations[sectionCount + idx];
        
        if (!newTranslatedItems[mapping.itemId]) {
          const originalItem = items.find(i => i.item_id === mapping.itemId);
          newTranslatedItems[mapping.itemId] = {
            name: originalItem?.name || '',
            descriptions: [...(originalItem?.descriptions || [])]
          };
        }
        
        if (mapping.type === 'name') {
          newTranslatedItems[mapping.itemId].name = translation;
        } else if (mapping.type === 'desc' && mapping.descIndex !== undefined) {
          newTranslatedItems[mapping.itemId].descriptions[mapping.descIndex] = translation;
        }
      });
      
      setTranslatedSections(newTranslatedSections);
      setTranslatedItems(newTranslatedItems);
      setCurrentLanguage(targetLang);
      
    } catch (error) {
      console.error('Translation error:', error);
      // Show user-friendly error message
      Alert.alert('Traduction indisponible', 'La traduction automatique n\'est pas disponible pour le moment. Veuillez réessayer plus tard.');
      // Reset to French on error
      setCurrentLanguage('fr');
    } finally {
      setIsTranslating(false);
    }
  };
  
  // Get translated name/description for an item
  const getTranslatedName = (item: MenuItem | null | undefined): string => {
    if (!item) return '';
    if (currentLanguage === 'fr') return item.name;
    
    // Special case: Ardoise items have item_id like "ardoise_entree_0", "ardoise_plat_1"
    if (item.item_id && item.item_id.startsWith('ardoise_')) {
      const key = `${item.item_id}_name`;
      // Try cachedTranslations first (state)
      if (cachedTranslations[currentLanguage]?.[key]) {
        return cachedTranslations[currentLanguage][key];
      }
      // Also try the ref as backup
      if (cachedTranslationsRef.current[currentLanguage]?.[key]) {
        return cachedTranslationsRef.current[currentLanguage][key];
      }
    }
    
    // First try: translatedItems (from translateMenu)
    if (translatedItems[item.item_id]?.name) {
      return translatedItems[item.item_id].name;
    }
    
    // Second try: cachedTranslations with item_ key
    if (cachedTranslations[currentLanguage]?.[`item_${item.item_id}_name`]) {
      return cachedTranslations[currentLanguage][`item_${item.item_id}_name`];
    }
    
    // Third try: For Ardoise items - search by name in ardoiseData
    if (ardoiseData && cachedTranslations[currentLanguage]) {
      const ardoiseCategories = ['entree', 'plat', 'dessert'] as const;
      for (const cat of ardoiseCategories) {
        const catItems = ardoiseData[cat] || [];
        const ardoiseIdx = catItems.findIndex((ai: ArdoiseItem) => ai.name === item.name);
        if (ardoiseIdx >= 0) {
          const key = `ardoise_${cat}_${ardoiseIdx}_name`;
          if (cachedTranslations[currentLanguage][key]) {
            return cachedTranslations[currentLanguage][key];
          }
        }
      }
    }
    
    return item.name;
  };
  
  const getTranslatedDescriptions = (item: MenuItem | null | undefined): string[] => {
    if (!item) return [];
    if (currentLanguage === 'fr') return item.descriptions || [];
    
    // Special case: Ardoise items have item_id like "ardoise_entree_0", "ardoise_plat_1"
    if (item.item_id && item.item_id.startsWith('ardoise_')) {
      const key = `${item.item_id}_description`;
      if (cachedTranslations[currentLanguage]?.[key]) {
        return [cachedTranslations[currentLanguage][key]];
      }
      // Also try the ref as backup
      if (cachedTranslationsRef.current[currentLanguage]?.[key]) {
        return [cachedTranslationsRef.current[currentLanguage][key]];
      }
    }
    
    // First try: translatedItems
    if (translatedItems[item.item_id]?.descriptions) {
      return translatedItems[item.item_id].descriptions;
    }
    
    // Second try: For Ardoise items - search by name in ardoiseData for descriptions
    if (ardoiseData && cachedTranslations[currentLanguage]) {
      const ardoiseCategories = ['entree', 'plat', 'dessert'] as const;
      for (const cat of ardoiseCategories) {
        const catItems = ardoiseData[cat] || [];
        const ardoiseIdx = catItems.findIndex((ai: ArdoiseItem) => ai.name === item.name);
        if (ardoiseIdx >= 0) {
          const descKey = `ardoise_${cat}_${ardoiseIdx}_description`;
          if (cachedTranslations[currentLanguage][descKey]) {
            return [cachedTranslations[currentLanguage][descKey]];
          }
        }
      }
    }
    
    return item.descriptions || [];
  };

  // Get translated Ardoise item name - depends on currentLanguage state
  const getTranslatedArdoiseItem = (category: string, index: number, originalName: string): string => {
    if (currentLanguage === 'fr') return originalName;
    const key = `ardoise_${category}_${index}_name`;
    // Use cachedTranslations state for reactivity
    const langData = cachedTranslations[currentLanguage];
    if (langData && langData[key]) {
      return langData[key];
    }
    return originalName;
  };

  // Load data
  useEffect(() => {
    loadData();
  }, [restaurant_id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Load restaurant info
      const restoRes = await fetch(`${API_URL}/api/restaurants/${restaurant_id}/public`);
      if (!restoRes.ok) throw new Error('Restaurant non trouvé');
      const restoData = await restoRes.json();
      setRestaurant(restoData);
      
      // Load menu sections and items
      const menuRes = await fetch(`${API_URL}/api/menu-restaurant/public/${restaurant_id}`);
      if (!menuRes.ok) throw new Error('Menu non disponible');
      const menuData = await menuRes.json();
      setSections(menuData.sections || []);
      setItems(menuData.items || []);
      
      // Load ardoise data (plats du jour pour A L'ARDOISE)
      try {
        const ardoiseRes = await fetch(`${API_URL}/api/ardoise/by-restaurant/${restaurant_id}`);
        if (ardoiseRes.ok) {
          const ardoise = await ardoiseRes.json();
          setArdoiseData(ardoise);
        }
      } catch (e) {
        // Ardoise not available, continue without it
      }
      
      // Load cached translations for instant language switching
      try {
        const transRes = await fetch(`${API_URL}/api/public/translations/${restaurant_id}`);
        if (transRes.ok) {
          const translations = await transRes.json();
          setCachedTranslations(translations);
          cachedTranslationsRef.current = translations;
        }
      } catch (e) {
        // Translations not available, will use API fallback
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter sections by menu type and sort by order
  const filteredSections = sections
    .filter(s => s.menu_type === currentTab && !s.parent_section_id)
    .sort((a, b) => (a.order || 999) - (b.order || 999));
  
  // Filter items by allergens
  const filterItemsByAllergens = (itemList: MenuItem[]) => {
    if (excludedAllergens.length === 0) return itemList;
    return itemList.filter(item => {
      if (!item.allergens || item.allergens.length === 0) return true;
      return !item.allergens.some(a => excludedAllergens.includes(a));
    });
  };

  // Add to cart
  const addToCart = (item: MenuItem, formatName?: string, price?: number, cookingOption?: string) => {
    const cartItem: CartItem = {
      item_id: item.item_id + (formatName || '') + (cookingOption ? `-${cookingOption}` : ''),
      original_item_id: item.item_id, // Keep original for translation lookup
      name: item.name,
      format_name: formatName,
      price: price || item.price || 0,
      quantity: 1,
      cooking_option: cookingOption
    };
    
    const existingIndex = cart.findIndex(c => c.item_id === cartItem.item_id);
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([...cart, cartItem]);
    }
    
    setShowFormatModal(false);
    setSelectedItem(null);
    setShowCookingModal(false);
    setPendingCookingItem(null);
  };

  // Handle cart button click
  const handleAddToCart = (item: MenuItem) => {
    // Helper function to process item after format selection (or directly)
    const processItem = (formatName?: string, price?: number) => {
      // Check if cooking choice is required
      if (item.requires_cooking_choice && item.cooking_options && item.cooking_options.length > 0) {
        setPendingCookingItem({ item, formatName, price });
        setShowCookingModal(true);
      } else {
        addToCart(item, formatName, price);
      }
    };

    if (item.formats && item.formats.length > 1) {
      // Multiple formats - show selection modal
      setSelectedItem(item);
      setShowFormatModal(true);
    } else if (item.formats && item.formats.length === 1) {
      // Single format
      const fmt = item.formats[0];
      processItem(fmt.name, getPrice(fmt));
    } else if (item.price) {
      // Simple price
      processItem(undefined, item.price);
    }
  };
  
  // Handle format selection with cooking check
  const handleFormatSelect = (item: MenuItem, formatName: string, price: number) => {
    setShowFormatModal(false);
    if (item.requires_cooking_choice && item.cooking_options && item.cooking_options.length > 0) {
      setPendingCookingItem({ item, formatName, price });
      setShowCookingModal(true);
    } else {
      addToCart(item, formatName, price);
    }
  };
  
  // Handle cooking option selection
  const handleCookingSelect = (cookingOption: string) => {
    if (pendingCookingItem) {
      addToCart(
        pendingCookingItem.item, 
        pendingCookingItem.formatName, 
        pendingCookingItem.price, 
        cookingOption
      );
    }
  };

  // Remove from cart
  const removeFromCart = (itemId: string) => {
    const existingIndex = cart.findIndex(c => c.item_id === itemId);
    if (existingIndex >= 0) {
      const newCart = [...cart];
      if (newCart[existingIndex].quantity > 1) {
        newCart[existingIndex].quantity -= 1;
      } else {
        newCart.splice(existingIndex, 1);
      }
      setCart(newCart);
    }
  };

  // Calculate total
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Colors
  const primaryColor = restaurant?.primary_color || '#2C3E50';
  const secondaryColor = restaurant?.secondary_color || '#F5E6D3';

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: secondaryColor }}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={{ marginTop: 16, color: primaryColor }}>Chargement du menu...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 20 }}>
        <AlertCircle size={64} color="#dc3545" />
        <Text style={{ fontSize: 18, color: '#dc3545', marginTop: 16, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: secondaryColor }}>
      {/* Back to Admin button - top left */}
      <View style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000 }}>
        <TouchableOpacity 
          onPress={() => {
            if (Platform.OS === 'web') {
              // For PWA on iOS, we need to navigate directly to the main app
              // history.back() doesn't work reliably in PWA/standalone mode
              const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
              
              if (isStandalone) {
                // In PWA standalone mode, navigate to origin (main app)
                window.location.href = window.location.origin;
              } else if (window.history.length > 1) {
                // In browser, try history.back()
                window.history.back();
              } else {
                // Fallback: navigate to root
                window.location.href = '/';
              }
            }
          }}
          style={{
            backgroundColor: primaryColor,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 5
          }}
        >
          <ArrowLeft size={18} color={secondaryColor} />
          <Text style={{ marginLeft: 6, fontWeight: '600', color: secondaryColor, fontSize: 14 }}>Retour</Text>
        </TouchableOpacity>
      </View>
      
      {/* Language button fixed at top right */}
      <View style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
        <TouchableOpacity 
          onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
          style={{
            backgroundColor: 'rgba(255,255,255,0.95)',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 5
          }}
        >
          <Text style={{ fontSize: 18 }}>{LANGUAGES.find(l => l.code === currentLanguage)?.flag}</Text>
          <Text style={{ marginLeft: 6, fontWeight: '600', color: primaryColor }}>
            {LANGUAGES.find(l => l.code === currentLanguage)?.name}
          </Text>
          {showLanguageDropdown ? <ChevronUp size={16} color={primaryColor} style={{ marginLeft: 4 }} /> : <ChevronDown size={16} color={primaryColor} style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
        
        {/* Language dropdown */}
        {showLanguageDropdown && (
          <View style={{
            position: 'absolute',
            top: 45,
            right: 0,
            backgroundColor: '#fff',
            borderRadius: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 10,
            minWidth: 160,
            paddingVertical: 8
          }}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => {
                  if (lang.code !== currentLanguage) {
                    translateMenu(lang.code);
                  }
                  setShowLanguageDropdown(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: currentLanguage === lang.code ? 'rgba(0,0,0,0.05)' : 'transparent'
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 10 }}>{lang.flag}</Text>
                <Text style={{ 
                  fontSize: 14, 
                  fontWeight: currentLanguage === lang.code ? 'bold' : 'normal',
                  color: '#333'
                }}>{lang.name}</Text>
                {currentLanguage === lang.code && (
                  <Check size={18} color={primaryColor} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      
      <ScrollView style={{ flex: 1 }} stickyHeaderIndices={[1]}>
        {/* Header with logo and info */}
        <View style={{ alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: primaryColor }}>
          {restaurant?.logo_base64 && (
            <Image 
              source={{ uri: restaurant.logo_base64.startsWith('data:') ? restaurant.logo_base64 : `data:image/png;base64,${restaurant.logo_base64}` }}
              style={{ width: 120, height: 120, marginBottom: 12 }}
              resizeMode="contain"
            />
          )}
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: secondaryColor }}>{restaurant?.name}</Text>
          
          {/* Restaurant info */}
          {(restaurant?.address_street || restaurant?.phone || restaurant?.email) && (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              {restaurant?.address_street && (
                <Text style={{ color: secondaryColor, fontSize: 13, opacity: 0.9 }}>
                  {restaurant.address_street}, {restaurant.address_postal_code} {restaurant.address_city}
                </Text>
              )}
              {restaurant?.phone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}>
                  <Text style={{ color: secondaryColor, fontSize: 13, marginTop: 4 }}>📞 {restaurant.phone}</Text>
                </TouchableOpacity>
              )}
              {restaurant?.email && (
                <TouchableOpacity onPress={() => Linking.openURL(`mailto:${restaurant.email}`)}>
                  <Text style={{ color: secondaryColor, fontSize: 13, marginTop: 4 }}>✉️ {restaurant.email}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {/* WiFi info */}
          {restaurant?.wifi_name && (
            <View style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Wifi size={16} color={secondaryColor} style={{ marginRight: 6 }} />
              <Text style={{ color: secondaryColor, fontSize: 13, textAlign: 'center' }}>
                {t('wifi')}: <Text style={{ fontWeight: 'bold' }}>{restaurant.wifi_name}</Text>
                {restaurant.wifi_password && <Text> | {t('password')}: <Text style={{ fontWeight: 'bold' }}>{restaurant.wifi_password}</Text></Text>}
              </Text>
            </View>
          )}
          
          {/* Social links - always show buttons */}
          <View style={{ flexDirection: 'row', marginTop: 12, gap: 16, justifyContent: 'center' }}>
            <TouchableOpacity 
              onPress={() => restaurant?.facebook_url && Linking.openURL(restaurant.facebook_url)}
              style={{ opacity: restaurant?.facebook_url ? 1 : 0.5 }}
            >
              <View style={{ backgroundColor: '#1877F2', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Facebook size={20} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600' }}>Facebook</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => restaurant?.instagram_url && Linking.openURL(restaurant.instagram_url)}
              style={{ opacity: restaurant?.instagram_url ? 1 : 0.5 }}
            >
              <View style={{ backgroundColor: '#E4405F', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Instagram size={20} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600' }}>Instagram</Text>
              </View>
            </TouchableOpacity>
          </View>
          
          {/* Happy Hour indicator */}
          {isHappyHour() && (
            <View style={{ marginTop: 12, backgroundColor: '#FF6B35', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>🍹 HAPPY HOUR EN COURS !</Text>
            </View>
          )}
          
          {/* Translation indicator */}
          {isTranslating && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: secondaryColor, textAlign: 'center', fontSize: 12 }}>
                ⏳ Traduction en cours...
              </Text>
            </View>
          )}
        </View>
        
        {/* STICKY SECTION: Tabs + Allergen Filter + Navigation */}
        <View style={{ backgroundColor: secondaryColor, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }}>
        {/* Menu type tabs */}
        <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
          <TouchableOpacity 
            style={{ 
              flex: 1, 
              padding: 14, 
              borderRadius: 10, 
              backgroundColor: currentTab === 'food' ? primaryColor : '#fff',
              alignItems: 'center'
            }}
            onPress={() => setCurrentTab('food')}
          >
            <Text style={{ color: currentTab === 'food' ? secondaryColor : primaryColor, fontWeight: 'bold', fontSize: 16 }}>
              🍽️ {t('carte_food')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ 
              flex: 1, 
              padding: 14, 
              borderRadius: 10, 
              backgroundColor: currentTab === 'boisson' ? primaryColor : '#fff',
              alignItems: 'center'
            }}
            onPress={() => setCurrentTab('boisson')}
          >
            <Text style={{ color: currentTab === 'boisson' ? secondaryColor : primaryColor, fontWeight: 'bold', fontSize: 16 }}>
              🍷 {t('carte_boisson')}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Allergen filter */}
        <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
          <TouchableOpacity 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: 12, 
              backgroundColor: excludedAllergens.length > 0 ? '#ffebee' : '#fff', 
              borderRadius: 10,
              borderWidth: 1,
              borderColor: excludedAllergens.length > 0 ? '#ef5350' : '#ddd'
            }}
            onPress={() => setShowAllergenModal(true)}
          >
            <Text style={{ fontSize: 18 }}>🥜</Text>
            <Text style={{ marginLeft: 8, color: excludedAllergens.length > 0 ? '#c62828' : '#666', fontWeight: '500', flex: 1 }}>
              {excludedAllergens.length > 0 ? `${t('filter_allergens')} (${excludedAllergens.length})` : t('filter_allergens')}
            </Text>
            <ChevronRight size={20} color="#666" />
          </TouchableOpacity>
        </View>
        
        {/* Navigation rapide - STICKY */}
        {filteredSections.length > 0 && (
          <View style={{ paddingHorizontal: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {filteredSections.map(section => (
                  <TouchableOpacity
                    key={section.section_id}
                    style={{
                      backgroundColor: section.color || primaryColor,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20
                    }}
                    onPress={() => {
                      // Scroll to section
                      const el = document.getElementById(`section-${section.section_id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{getTranslatedSectionName(section)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </View>
      
        {/* Menu items by section */}
        {filteredSections.map(section => {
          // Check if A L'ARDOISE should be visible
          const isArdoiseSection = section.name.toUpperCase().includes('ARDOISE');
          // Note: Time restriction removed - ardoise is now visible all day
          // Original restriction was: Only show from midnight (00:00) until 16:00 (4 PM)
          
          const sectionItems = filterItemsByAllergens(
            items.filter(i => i.section_id === section.section_id)
          );
          
          // Also get items from subsections
          const subSections = sections.filter(s => s.parent_section_id === section.section_id);
          
          // Don't hide A L'ARDOISE section even if it has no regular items (it uses ardoiseData)
          if (sectionItems.length === 0 && subSections.length === 0 && !isArdoiseSection) return null;
          
          // Check if this is a formule section
          const isFormuleSection = isInFormuleSection(section);
          
          return (
            <View key={section.section_id} id={`section-${section.section_id}`} style={{ marginBottom: 16 }}>
              {/* Section header */}
              <View style={{ backgroundColor: section.color || primaryColor, padding: 12, marginHorizontal: 12, borderRadius: 10, marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>{getTranslatedSectionName(section)}</Text>
                {/* Special note for A L'ARDOISE */}
                {isArdoiseSection && (
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
                    {t('ardoise_note')}
                  </Text>
                )}
                {/* Special note for MENU ENFANT */}
                {section.name.toUpperCase().includes('ENFANT') && (
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
                    {t('menu_enfant_note')}
                  </Text>
                )}
              </View>
              
              {/* SPECIAL: For A L'ARDOISE section, display category details from ardoiseData */}
              {isArdoiseSection && ardoiseData && (
                <View style={{ marginHorizontal: 12, marginBottom: 8 }}>
                  {/* Entrée */}
                  {ardoiseData.entree && ardoiseData.entree.length > 0 && (
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: primaryColor, marginBottom: 6 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: primaryColor }}>{translateCategory('Entrée')}</Text>
                      <View style={{ marginTop: 4 }}>
                        {ardoiseData.entree.filter(item => item.name?.trim()).map((item, idx) => (
                          <Text key={idx} style={{ color: '#666', fontSize: 13, marginBottom: 2 }}>{getTranslatedArdoiseItem('entree', idx, item.name)}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {/* Plat */}
                  {ardoiseData.plat && ardoiseData.plat.length > 0 && (
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: primaryColor, marginBottom: 6 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: primaryColor }}>{translateCategory('Plat')}</Text>
                      <View style={{ marginTop: 4 }}>
                        {ardoiseData.plat.filter(item => item.name?.trim()).map((item, idx) => (
                          <Text key={idx} style={{ color: '#666', fontSize: 13, marginBottom: 2 }}>{getTranslatedArdoiseItem('plat', idx, item.name)}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                  {/* Dessert */}
                  {ardoiseData.dessert && ardoiseData.dessert.length > 0 && (
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: primaryColor, marginBottom: 6 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: primaryColor }}>{translateCategory('Dessert')}</Text>
                      <View style={{ marginTop: 4 }}>
                        {ardoiseData.dessert.filter(item => item.name?.trim()).map((item, idx) => (
                          <Text key={idx} style={{ color: '#666', fontSize: 13, marginBottom: 2 }}>{getTranslatedArdoiseItem('dessert', idx, item.name)}</Text>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
              
              {/* Section items */}
              {sectionItems.map(item => {
                const itemIsFormule = isFormule(item);
                const itemIsCategoryHeader = isCategoryHeader(item);
                // In formule sections: only formules get cart button
                // Category headers and items under categories don't get cart button
                // Also show cart for "Plat du jour" in A L'ARDOISE (needs selection)
                const showCartButton = isFormuleSection 
                  ? (itemIsFormule || isPlatDuJour(item))  // Show cart for formules AND plat du jour
                  : (item.price !== undefined && item.price !== null) || (item.formats && item.formats.length > 0);
                
                // Category headers are styled differently
                if (itemIsCategoryHeader) {
                  return (
                    <View 
                      key={item.item_id}
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        marginHorizontal: 12,
                        marginBottom: 6,
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 8,
                        borderLeftWidth: 4,
                        borderLeftColor: primaryColor
                      }}
                    >
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: primaryColor }}>{getTranslatedName(item)}</Text>
                      {getTranslatedDescriptions(item).length > 0 && (
                        <View style={{ marginTop: 4 }}>
                          {getTranslatedDescriptions(item).map((desc, idx) => (
                            <Text key={idx} style={{ color: '#666', fontSize: 13, marginBottom: 2 }}>{desc}</Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                }
                
                return (
                  <View 
                    key={item.item_id} 
                    style={{ 
                      backgroundColor: '#fff', 
                      marginHorizontal: 12, 
                      marginBottom: 6, 
                      padding: 12, 
                      borderRadius: 10,
                      flexDirection: 'row',
                      alignItems: 'center'
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', fontSize: 15, color: '#333' }}>{getTranslatedName(item)}</Text>
                      {/* For category items (Boisson, Plat, Dessert), show ALL descriptions */}
                      {itemIsCategoryHeader && getTranslatedDescriptions(item)?.length > 0 ? (
                        <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }} numberOfLines={5}>
                          {getTranslatedDescriptions(item).join('\n')}
                        </Text>
                      ) : getTranslatedDescriptions(item)?.[0] ? (
                        <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }} numberOfLines={2}>{getTranslatedDescriptions(item)[0]}</Text>
                      ) : null}
                      {/* Allergen icons - HIDDEN per user request */}
                    </View>
                    
                    {/* Prices */}
                    <View style={{ alignItems: 'flex-end', marginRight: showCartButton ? 8 : 0 }}>
                      {item.price && !item.formats?.length && (
                        <Text style={{ fontWeight: 'bold', color: primaryColor, fontSize: 16 }}>{item.price.toFixed(2)}€</Text>
                      )}
                      {item.formats && item.formats.length > 0 && (
                        <View style={{ alignItems: 'flex-end' }}>
                          {item.formats.map((fmt, idx) => {
                            // Translate format names (Petit/Petite/Grand/Grande)
                            const fmtLower = fmt.name.toLowerCase();
                            const translatedFormatName = (fmtLower === 'petit' || fmtLower === 'petite') ? t('small') 
                              : (fmtLower === 'grand' || fmtLower === 'grande') ? t('large') 
                              : fmt.name;
                            return (
                              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx < item.formats.length - 1 ? 2 : 0 }}>
                                <Text style={{ fontSize: 11, color: '#666', marginRight: 8 }}>{translatedFormatName}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: primaryColor, minWidth: 50, textAlign: 'right' }}>{getPrice(fmt).toFixed(2)}€</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    
                    {/* Add to cart button - only show when appropriate */}
                    {showCartButton && (
                      <TouchableOpacity 
                        testID={`add-to-cart-${item.item_id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Ajouter ${item.name} au panier`}
                        style={{ 
                          backgroundColor: primaryColor, 
                          width: 40, 
                          height: 40, 
                          borderRadius: 20, 
                          justifyContent: 'center', 
                          alignItems: 'center' 
                        }}
                        onPress={() => {
                          if (itemIsFormule) {
                            handleFormuleClick(item);
                          } else if (isPlatDuJour(item)) {
                            // Open modal with plat options from ardoise
                            handlePlatDuJourClick(item);
                          } else {
                            handleAddToCart(item);
                          }
                        }}
                      >
                        <ShoppingCart size={20} color={secondaryColor} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              
              {/* Subsections */}
              {subSections.map(subSection => {
                const subItems = filterItemsByAllergens(
                  items.filter(i => i.section_id === subSection.section_id)
                );
                if (subItems.length === 0) return null;
                
                return (
                  <View key={subSection.section_id} style={{ marginTop: 8 }}>
                    <View style={{ backgroundColor: subSection.color || '#607d8b', padding: 10, marginHorizontal: 16, borderRadius: 8, marginBottom: 6 }}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{subSection.name}</Text>
                    </View>
                    {subItems.map(item => (
                      <View 
                        key={item.item_id} 
                        style={{ 
                          backgroundColor: '#fff', 
                          marginHorizontal: 16, 
                          marginBottom: 6, 
                          padding: 12, 
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center'
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600', fontSize: 15, color: '#333' }}>{getTranslatedName(item)}</Text>
                          {getTranslatedDescriptions(item)?.[0] && (
                            <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }} numberOfLines={2}>{getTranslatedDescriptions(item)[0]}</Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                          {item.price && !item.formats?.length && (
                            <Text style={{ fontWeight: 'bold', color: primaryColor, fontSize: 16 }}>{item.price.toFixed(2)}€</Text>
                          )}
                          {item.formats && item.formats.length > 0 && (
                            <View style={{ alignItems: 'flex-end' }}>
                              {item.formats.map((fmt, idx) => {
                                // Translate format names like "Petit", "Grand", "Petite", "Grande"
                                const fmtLower = fmt.name.toLowerCase();
                                const translatedFmtName = fmtLower === 'petit' || fmtLower === 'petite' ? t('small') 
                                  : fmtLower === 'grand' || fmtLower === 'grande' ? t('large') 
                                  : fmt.name;
                                return (
                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx < item.formats.length - 1 ? 2 : 0 }}>
                                  <Text style={{ fontSize: 11, color: '#666', marginRight: 8 }}>{translatedFmtName}</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: primaryColor, minWidth: 50, textAlign: 'right' }}>{getPrice(fmt).toFixed(2)}€</Text>
                                </View>
                              );})}
                            </View>
                          )}
                        </View>
                        <TouchableOpacity 
                          style={{ backgroundColor: primaryColor, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}
                          onPress={() => handleAddToCart(item)}
                        >
                          <ShoppingCart size={20} color={secondaryColor} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
        
        {/* Bottom padding for floating cart */}
        <View style={{ height: 100 }} />
      </ScrollView>
      
      {/* Floating cart button */}
      {cartCount > 0 && (
        <TouchableOpacity 
          style={{ 
            position: 'absolute', 
            bottom: 20, 
            right: 20, 
            backgroundColor: primaryColor, 
            borderRadius: 30,
            paddingVertical: 14,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8
          }}
          onPress={() => setShowCart(true)}
        >
          <ShoppingCart size={24} color={secondaryColor} />
          <View style={{ backgroundColor: '#ff4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{cartCount}</Text>
          </View>
          <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>{cartTotal.toFixed(2)}€</Text>
        </TouchableOpacity>
      )}
      
      {/* Format selection modal */}
      <Modal visible={showFormatModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '85%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 4 }}>{getTranslatedName(selectedItem as any)}</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>{t('choose_size')}</Text>
            
            {selectedItem?.formats?.map((fmt, idx) => {
              // Translate format names (Petit/Petite/Grand/Grande)
              const fmtLower = fmt.name.toLowerCase();
              const translatedFmtName = fmtLower === 'petit' || fmtLower === 'petite' ? t('small')
                : fmtLower === 'grand' || fmtLower === 'grande' ? t('large')
                : fmt.name;
              
              return (
              <TouchableOpacity
                key={idx}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 14,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 10,
                  marginBottom: 8
                }}
                onPress={() => handleFormatSelect(selectedItem, fmt.name, getPrice(fmt))}
              >
                <Text style={{ fontSize: 16, fontWeight: '500', color: '#333' }}>
                  {translatedFmtName}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>{getPrice(fmt).toFixed(2)}€</Text>
              </TouchableOpacity>
            );})}
            
            <TouchableOpacity 
              style={{ marginTop: 8, padding: 12, alignItems: 'center' }}
              onPress={() => { setShowFormatModal(false); setSelectedItem(null); }}
            >
              <Text style={{ color: '#666' }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cooking option modal */}
      <Modal visible={showCookingModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '90%', maxWidth: 380, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 24, marginRight: 10 }}>🔥</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>
                {t('cooking_choice')}
              </Text>
            </View>
            
            {pendingCookingItem && (
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
                {t('cooking_for')}: <Text style={{ fontWeight: '600', color: '#333' }}>{getTranslatedName(pendingCookingItem.item)}</Text>
              </Text>
            )}
            
            <View style={{ marginBottom: 16 }}>
              {pendingCookingItem?.item.cooking_options?.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    padding: 14, 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: 10, 
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: '#e9ecef'
                  }}
                  onPress={() => handleCookingSelect(option)}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>🥩</Text>
                  <Text style={{ fontSize: 16, color: '#333', fontWeight: '500' }}>{translateCookingOption(option)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              style={{ padding: 14, backgroundColor: '#f1f1f1', borderRadius: 10, alignItems: 'center' }}
              onPress={() => { setShowCookingModal(false); setPendingCookingItem(null); }}
            >
              <Text style={{ color: '#666', fontWeight: '500' }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Formule composition modal */}
      <Modal visible={showFormuleModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>{formuleComposition?.formule ? getTranslatedName(formuleComposition.formule) : ''}</Text>
                <Text style={{ fontSize: 16, color: '#666', marginTop: 2 }}>{formuleComposition?.formule.price?.toFixed(2)}€</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowFormuleModal(false); setFormuleComposition(null); }}>
                <X size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={{ paddingHorizontal: 20, paddingTop: 12, color: '#666', fontSize: 14 }}>
              {t('compose_formula_desc')}
            </Text>
            
            <ScrollView style={{ padding: 16 }}>
              {formuleComposition?.requiredCategories.map(category => {
                const categoryItems = getCategoryItems(category, formuleComposition.formule.section_id, formuleComposition.formule);
                const selectedItem = formuleComposition.selectedItems[category];
                
                return (
                  <View key={category} style={{ marginBottom: 20 }}>
                    {/* Category header */}
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      backgroundColor: primaryColor, 
                      padding: 12, 
                      borderRadius: 10,
                      marginBottom: 8
                    }}>
                      <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 16 }}>{translateCategory(category)}</Text>
                      {selectedItem ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Check size={20} color="#4CAF50" />
                          <Text style={{ color: '#4CAF50', fontWeight: '600', fontSize: 12 }}>{t('selected')}</Text>
                        </View>
                      ) : (
                        <Text style={{ color: '#FF6B35', fontSize: 12 }}>{t('to_select')}</Text>
                      )}
                    </View>
                    
                    {/* Items to select from */}
                    {categoryItems.length > 0 ? (
                      categoryItems.map(item => {
                        const isSelected = selectedItem?.item_id === item.item_id;
                        return (
                          <TouchableOpacity
                            key={item.item_id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: 12,
                              backgroundColor: isSelected ? 'rgba(76, 175, 80, 0.1)' : '#f8f8f8',
                              borderRadius: 10,
                              marginBottom: 6,
                              borderWidth: isSelected ? 2 : 0,
                              borderColor: '#4CAF50'
                            }}
                            onPress={() => {
                              if (formuleComposition) {
                                setFormuleComposition({
                                  ...formuleComposition,
                                  selectedItems: {
                                    ...formuleComposition.selectedItems,
                                    [category]: isSelected ? null : item
                                  }
                                });
                              }
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontWeight: '500', color: '#333' }}>{getTranslatedName(item)}</Text>
                              {item.descriptions?.[0] && (
                                <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{getTranslatedDescriptions(item)[0]}</Text>
                              )}
                            </View>
                            {isSelected && <Check size={24} color="#4CAF50" />}
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <Text style={{ color: '#999', fontStyle: 'italic', padding: 12 }}>
                        {t('no_choice')}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            
            {/* Validation button */}
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
              {/* Check if all categories are selected */}
              {(() => {
                const allSelected = formuleComposition?.requiredCategories.every(
                  cat => formuleComposition.selectedItems[cat] !== null
                );
                return (
                  <TouchableOpacity
                    style={{
                      backgroundColor: allSelected ? primaryColor : '#ccc',
                      padding: 16,
                      borderRadius: 12,
                      alignItems: 'center',
                      opacity: allSelected ? 1 : 0.7
                    }}
                    onPress={allSelected ? addFormuleToCart : undefined}
                    disabled={!allSelected}
                  >
                    <Text style={{ color: allSelected ? secondaryColor : '#666', fontWeight: 'bold', fontSize: 16 }}>
                      {allSelected ? `✓ ${t('add_to_cart')}` : t('select_all_elements')}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Cart modal */}
      <Modal visible={showCart} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: primaryColor }}>🛒 {t('your_cart')}</Text>
              <TouchableOpacity onPress={() => setShowCart(false)}>
                <X size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 400, padding: 16 }}>
              {cart.map((item, idx) => {
                // Get translated name for cart item using original_item_id
                let translatedName = item.name;
                if (currentLanguage !== 'fr') {
                  // Use original_item_id for translation lookup
                  const originalId = item.original_item_id || item.item_id;
                  
                  // Try translatedItems first (from translateMenu)
                  if (translatedItems[originalId]?.name) {
                    translatedName = translatedItems[originalId].name;
                  } 
                  // Then try cachedTranslations directly
                  else if (cachedTranslations[currentLanguage]?.[`item_${originalId}_name`]) {
                    translatedName = cachedTranslations[currentLanguage][`item_${originalId}_name`];
                  }
                  // Try ref
                  else if (cachedTranslationsRef.current[currentLanguage]?.[`item_${originalId}_name`]) {
                    translatedName = cachedTranslationsRef.current[currentLanguage][`item_${originalId}_name`];
                  }
                  // Last resort: find item by name and use its translation
                  else {
                    const matchingItem = items.find(i => i.name === item.name);
                    if (matchingItem) {
                      const matchingId = matchingItem.item_id;
                      if (translatedItems[matchingId]?.name) {
                        translatedName = translatedItems[matchingId].name;
                      } else if (cachedTranslations[currentLanguage]?.[`item_${matchingId}_name`]) {
                        translatedName = cachedTranslations[currentLanguage][`item_${matchingId}_name`];
                      }
                    }
                  }
                }
                
                // Translate format name (Petit/Petite/Grand/Grande)
                const fmtLower = item.format_name?.toLowerCase();
                const translatedFormatName = item.format_name 
                  ? (fmtLower === 'petite' || fmtLower === 'petit' ? t('small') 
                    : fmtLower === 'grande' || fmtLower === 'grand' ? t('large') 
                    : item.format_name)
                  : null;
                
                return (
                <View key={idx} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', fontSize: 15 }}>{translatedName}</Text>
                      {translatedFormatName && <Text style={{ color: '#666', fontSize: 13 }}>{translatedFormatName}</Text>}
                      {/* Show cooking option */}
                      {item.cooking_option && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Text style={{ fontSize: 14 }}>🔥</Text>
                          <Text style={{ color: '#e67e22', fontSize: 13, marginLeft: 4, fontWeight: '500' }}>{item.cooking_option}</Text>
                        </View>
                      )}
                      {/* Show formule composition */}
                      {item.composition && item.composition.length > 0 && (
                        <View style={{ marginTop: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: primaryColor }}>
                          {item.composition.map((comp, compIdx) => {
                            // Translate the composition item name
                            let translatedCompItemName = comp.item_name;
                            if (currentLanguage !== 'fr') {
                              // First try: Find in regular items array
                              const matchingItem = items.find(i => i.name === comp.item_name);
                              if (matchingItem && translatedItems[matchingItem.item_id]?.name) {
                                translatedCompItemName = translatedItems[matchingItem.item_id].name;
                              } else if (matchingItem && cachedTranslations[currentLanguage]?.[`item_${matchingItem.item_id}_name`]) {
                                translatedCompItemName = cachedTranslations[currentLanguage][`item_${matchingItem.item_id}_name`];
                              } else {
                                // Second try: For Ardoise items - search by name in ardoise translations
                                const categoryKey = comp.category.toLowerCase().replace(/[éè]/g, 'e');
                                const langData = cachedTranslations[currentLanguage];
                                if (langData && ardoiseData) {
                                  // Search through all ardoise categories
                                  const ardoiseCategories = ['entree', 'plat', 'dessert'];
                                  for (const cat of ardoiseCategories) {
                                    const catItems = ardoiseData[cat as keyof ArdoiseData] || [];
                                    const ardoiseIdx = catItems.findIndex((item: ArdoiseItem) => item.name === comp.item_name);
                                    if (ardoiseIdx >= 0) {
                                      const ardoiseKey = `ardoise_${cat}_${ardoiseIdx}_name`;
                                      if (langData[ardoiseKey]) {
                                        translatedCompItemName = langData[ardoiseKey];
                                        break;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            return (
                              <Text key={compIdx} style={{ color: '#666', fontSize: 12 }}>
                                • {translateCategory(comp.category)}: {translatedCompItemName}
                              </Text>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <TouchableOpacity 
                        style={{ backgroundColor: '#eee', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}
                        onPress={() => removeFromCart(item.item_id)}
                      >
                        <Minus size={20} color="#333" />
                      </TouchableOpacity>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, minWidth: 24, textAlign: 'center' }}>{item.quantity}</Text>
                      <TouchableOpacity 
                        style={{ backgroundColor: primaryColor, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}
                        onPress={() => {
                          const newCart = [...cart];
                          newCart[idx].quantity += 1;
                          setCart(newCart);
                        }}
                      >
                        <Plus size={20} color={secondaryColor} />
                      </TouchableOpacity>
                      <Text style={{ fontWeight: 'bold', color: primaryColor, fontSize: 16, minWidth: 60, textAlign: 'right' }}>{(item.price * item.quantity).toFixed(2)}€</Text>
                    </View>
                  </View>
                </View>
                );
              })}
            </ScrollView>
            
            {/* Total and validate */}
            <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: '#eee' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold' }}>{t('total')}</Text>
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>{cartTotal.toFixed(2)}€</Text>
              </View>
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, padding: 16, borderRadius: 12, alignItems: 'center' }}
                onPress={() => {
                  setShowCart(false);
                  setShowOrderSummary(true);
                }}
              >
                <Text style={{ color: secondaryColor, fontWeight: 'bold', fontSize: 18 }}>{t('validate_order')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Allergen filter modal */}
      <Modal visible={showAllergenModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>{t('exclude_dishes')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ALLERGENS.map(allergen => (
                <TouchableOpacity
                  key={allergen.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: excludedAllergens.includes(allergen.id) ? '#c62828' : '#ddd',
                    backgroundColor: excludedAllergens.includes(allergen.id) ? '#ffebee' : '#fff',
                  }}
                  onPress={() => {
                    if (excludedAllergens.includes(allergen.id)) {
                      setExcludedAllergens(excludedAllergens.filter(a => a !== allergen.id));
                    } else {
                      setExcludedAllergens([...excludedAllergens, allergen.id]);
                    }
                  }}
                >
                  <Text style={{ fontSize: 16 }}>{allergen.emoji}</Text>
                  <Text style={{ marginLeft: 6, fontSize: 13, color: excludedAllergens.includes(allergen.id) ? '#c62828' : '#333' }}>
                    {ALLERGEN_TRANSLATIONS[currentLanguage]?.[allergen.id] || allergen.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity 
              style={{ marginTop: 20, padding: 14, backgroundColor: primaryColor, borderRadius: 10 }}
              onPress={() => setShowAllergenModal(false)}
            >
              <Text style={{ color: secondaryColor, textAlign: 'center', fontWeight: 'bold' }}>{t('apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Order Summary Modal (for server) - FULLSCREEN */}
      <Modal visible={showOrderSummary} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 40 }}>
          {/* Header with QR Code at TOP */}
          <View style={{ alignItems: 'center', marginBottom: 12, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>Commande prête !</Text>
            <Text style={{ color: '#666', marginTop: 4, fontSize: 14 }}>Montrez ce ticket au serveur</Text>
            
            {/* QR Code at TOP - Simple short URL */}
            <View style={{ marginTop: 16, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: primaryColor, alignItems: 'center' }}>
              <QRCodeDisplay 
                cart={cart} 
                restaurant={restaurant} 
                cartTotal={cartTotal} 
                primaryColor={primaryColor}
              />
            </View>
            <Text style={{ fontSize: 12, color: '#333', marginTop: 10, textAlign: 'center', fontWeight: '500' }}>Scannez pour voir le ticket</Text>
          </View>
          
          {/* Order Receipt Style Display - ALWAYS IN FRENCH */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: primaryColor }}>
              {/* Restaurant Header */}
              <View style={{ alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{restaurant?.name || 'Restaurant'}</Text>
                <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>🍽️ COMMANDE</Text>
              </View>
              
              {/* Order Items - ALWAYS IN FRENCH (original names) */}
              {cart.map((item, idx) => {
                return (
                  <View key={idx} style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#333' }}>
                          {item.quantity}x {item.name}
                        </Text>
                        {item.format_name && (
                          <Text style={{ fontSize: 12, color: '#666' }}>
                            ({item.format_name})
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#333' }}>
                        {(item.price * item.quantity).toFixed(2)}€
                      </Text>
                    </View>
                    
                    {/* Composition details - IN FRENCH */}
                    {item.composition && item.composition.length > 0 && (
                      <View style={{ marginTop: 4, marginLeft: 12 }}>
                        {item.composition.map((comp, compIdx) => (
                          <Text key={compIdx} style={{ fontSize: 11, color: '#666' }}>
                            • {comp.category}: {comp.item_name}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
              
              {/* Total */}
              <View style={{ borderTopWidth: 2, borderTopColor: '#333', paddingTop: 12, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>TOTAL</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: primaryColor }}>{cartTotal.toFixed(2)}€</Text>
                </View>
              </View>
            </View>
          </ScrollView>
          
          <View style={{ flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: '#eee' }}>
            <TouchableOpacity 
              style={{ flex: 1, backgroundColor: '#f0f0f0', padding: 16, borderRadius: 12, alignItems: 'center' }}
              onPress={() => {
                setShowOrderSummary(false);
                setShowCart(true);
              }}
            >
              <ArrowLeft size={24} color="#666" />
              <Text style={{ color: '#666', fontWeight: '600', marginTop: 4, fontSize: 16 }}>{t('modify')}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ flex: 2, backgroundColor: '#4CAF50', padding: 16, borderRadius: 12, alignItems: 'center' }}
              onPress={() => {
                setShowOrderSummary(false);
                setCart([]);
              }}
            >
              <Check size={24} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: 'bold', marginTop: 4, fontSize: 16 }}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
