import React from 'react';
import { Platform, Text } from 'react-native';

// Mapping des icônes Lucide vers des emojis pour le web
const lucideToEmoji: { [key: string]: string } = {
  'Wifi': '📶',
  'Facebook': 'f',
  'Instagram': '📷',
  'ShoppingCart': '🛒',
  'X': '✕',
  'Check': '✓',
  'Plus': '➕',
  'Minus': '➖',
  'ChevronRight': '›',
  'ChevronUp': '∧',
  'ChevronDown': '∨',
  'ChevronLeft': '‹',
  'AlertCircle': '⚠️',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'Edit': '✏️',
  'Trash': '🗑️',
  'Trash2': '🗑️',
  'Copy': '📋',
  'Save': '💾',
  'Download': '⬇️',
  'Upload': '⬆️',
  'File': '📄',
  'FileText': '📄',
  'Folder': '📁',
  'FolderOpen': '📂',
  'Image': '🖼️',
  'Camera': '📷',
  'Video': '📹',
  'Music': '🎵',
  'Play': '▶️',
  'Pause': '⏸️',
  'Stop': '⏹️',
  'Settings': '⚙️',
  'Menu': '☰',
  'Home': '🏠',
  'User': '👤',
  'Users': '👥',
  'Mail': '✉️',
  'Phone': '📞',
  'MapPin': '📍',
  'Calendar': '📅',
  'Clock': '🕐',
  'Search': '🔍',
  'Filter': '🔍',
  'Star': '⭐',
  'Heart': '❤️',
  'ThumbsUp': '👍',
  'ThumbsDown': '👎',
  'Share': '📤',
  'Link': '🔗',
  'ExternalLink': '🔗',
  'Eye': '👁️',
  'EyeOff': '🙈',
  'Lock': '🔒',
  'Unlock': '🔓',
  'Key': '🔑',
  'Shield': '🛡️',
  'Bell': '🔔',
  'BellOff': '🔕',
  'Info': 'ℹ️',
  'HelpCircle': '❓',
  'AlertTriangle': '⚠️',
  'XCircle': '⊗',
  'CheckCircle': '✓',
  'Loader': '⏳',
  'RefreshCw': '🔄',
  'RotateCw': '🔄',
  'ZoomIn': '🔍',
  'ZoomOut': '🔍',
  'Maximize': '⤢',
  'Minimize': '⤡',
  'MoreHorizontal': '⋯',
  'MoreVertical': '⋮',
  'Grid': '📊',
  'List': '📝',
  'Layout': '📐',
  'Layers': '📚',
  'Package': '📦',
  'Box': '📦',
  'Gift': '🎁',
  'Tag': '🏷️',
  'Bookmark': '🔖',
  'Flag': '🚩',
  'Award': '🏆',
  'Target': '🎯',
  'Zap': '⚡',
  'Sun': '☀️',
  'Moon': '🌙',
  'Cloud': '☁️',
  'Droplet': '💧',
  'Wind': '💨',
  'Thermometer': '🌡️',
  'Umbrella': '☂️',
  'Coffee': '☕',
  'Beer': '🍺',
  'Wine': '🍷',
  'Pizza': '🍕',
  'Utensils': '🍽️',
  'Printer': '🖨️',
  'Clipboard': '📋',
  'ClipboardCheck': '📋',
  'ClipboardList': '📋',
};

interface LucideWebIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

export const LucideWebIcon: React.FC<LucideWebIconProps> = ({ name, size = 24, color = '#000', style }) => {
  const emoji = lucideToEmoji[name] || '•';
  return (
    <Text style={[{ fontSize: size * 0.8, color, textAlign: 'center' }, style]}>
      {emoji}
    </Text>
  );
};

// Export individual icon components that match lucide-react API
export const Wifi = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="Wifi" {...props} /> : null;
export const Facebook = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="Facebook" {...props} /> : null;
export const Instagram = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="Instagram" {...props} /> : null;
export const ShoppingCart = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="ShoppingCart" {...props} /> : null;
export const X = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="X" {...props} /> : null;
export const Check = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="Check" {...props} /> : null;
export const Plus = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="Plus" {...props} /> : null;
export const Minus = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="Minus" {...props} /> : null;
export const ChevronRight = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="ChevronRight" {...props} /> : null;
export const ChevronUp = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="ChevronUp" {...props} /> : null;
export const ChevronDown = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="ChevronDown" {...props} /> : null;
export const AlertCircle = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="AlertCircle" {...props} /> : null;
export const ArrowLeft = (props: any) => Platform.OS === 'web' ? <LucideWebIcon name="ArrowLeft" {...props} /> : null;

export default LucideWebIcon;
