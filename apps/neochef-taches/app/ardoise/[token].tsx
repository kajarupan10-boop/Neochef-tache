import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Platform,
  ActivityIndicator,
  Alert 
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// API URL - force the full path with /api prefix
const API_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/api` 
  : (process.env.EXPO_PUBLIC_BACKEND_URL ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api` : '/api');

interface ArdoiseItem {
  name: string;
  description: string;
  price: number | null;
  quantity_sold: number | null;
}

interface FormulePrices {
  plat_du_jour: number;
  entree_plat: number;
  plat_dessert: number;
  entree_plat_dessert: number;
}

interface ArdoiseData {
  restaurant_name: string;
  entree: ArdoiseItem[];
  plat: ArdoiseItem[];
  dessert: ArdoiseItem[];
  formule_prices: FormulePrices;
  updated_at: string;
}

const DEFAULT_FORMULE_PRICES: FormulePrices = {
  plat_du_jour: 15.90,
  entree_plat: 18.90,
  plat_dessert: 18.90,
  entree_plat_dessert: 23.90
};

export default function PublicArdoisePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [ardoiseData, setArdoiseData] = useState<ArdoiseData | null>(null);
  const [editingData, setEditingData] = useState<any>(null);
  const [editingFormulePrices, setEditingFormulePrices] = useState<FormulePrices>(DEFAULT_FORMULE_PRICES);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSalesMode, setShowSalesMode] = useState(false);
  const [showReportsMode, setShowReportsMode] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportPeriod, setReportPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Load ardoise data
  useEffect(() => {
    if (token) {
      loadArdoise();
    }
  }, [token]);

  const loadArdoise = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/ardoise/public/${token}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Ardoise non trouvée. Vérifiez le lien.');
        }
        throw new Error('Erreur lors du chargement');
      }
      const data = await response.json();
      setArdoiseData(data);
      
      const defaultItem = { name: '', description: '', price: null, quantity_sold: null };
      setEditingData({
        entree: data.entree?.length ? data.entree : [defaultItem, defaultItem],
        plat: data.plat?.length ? data.plat : [defaultItem, defaultItem],
        dessert: data.dessert?.length ? data.dessert : [defaultItem, defaultItem]
      });
      
      setEditingFormulePrices(data.formule_prices || DEFAULT_FORMULE_PRICES);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveArdoise = async () => {
    if (!editingData) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/ardoise/public/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingData,
          formule_prices: editingFormulePrices
        })
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde');
      }
      
      // Reload data
      await loadArdoise();
      setIsEditing(false);
      
      if (Platform.OS === 'web') {
        alert('Ardoise mise à jour avec succès !');
      } else {
        Alert.alert('Succès', 'Ardoise mise à jour avec succès !');
      }
    } catch (err: any) {
      if (Platform.OS === 'web') {
        alert('Erreur: ' + err.message);
      } else {
        Alert.alert('Erreur', err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveSales = async () => {
    if (!editingData) return;
    
    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours();
      const service = currentHour < 15 ? 'midi' : 'soir';
      
      const salesData = {
        date: today,
        service: service,
        entree: editingData.entree.map((item: ArdoiseItem) => ({
          name: item.name,
          quantity_sold: item.quantity_sold || 0
        })),
        plat: editingData.plat.map((item: ArdoiseItem) => ({
          name: item.name,
          quantity_sold: item.quantity_sold || 0
        })),
        dessert: editingData.dessert.map((item: ArdoiseItem) => ({
          name: item.name,
          quantity_sold: item.quantity_sold || 0
        })),
        formule_prices: editingFormulePrices
      };
      
      const response = await fetch(`${API_URL}/ardoise/public/${token}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salesData)
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de l\'enregistrement des ventes');
      }
      
      // Reset quantities
      const resetData = { ...editingData };
      ['entree', 'plat', 'dessert'].forEach(section => {
        resetData[section] = resetData[section].map((item: ArdoiseItem) => ({
          ...item,
          quantity_sold: null
        }));
      });
      setEditingData(resetData);
      setShowSalesMode(false);
      
      if (Platform.OS === 'web') {
        alert(`Ventes du service ${service} enregistrées avec succès !`);
      } else {
        Alert.alert('Succès', `Ventes du service ${service} enregistrées avec succès !`);
      }
    } catch (err: any) {
      if (Platform.OS === 'web') {
        alert('Erreur: ' + err.message);
      } else {
        Alert.alert('Erreur', err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const loadReport = async (period: 'day' | 'week' | 'month') => {
    setIsLoadingReport(true);
    setReportPeriod(period);
    try {
      const response = await fetch(`${API_URL}/ardoise/sales/report/public/${token}?period=${period}`);
      if (!response.ok) {
        throw new Error('Erreur lors du chargement du rapport');
      }
      const data = await response.json();
      setReportData(data);
    } catch (err: any) {
      console.error('Error loading report:', err);
      if (Platform.OS === 'web') {
        alert('Erreur: ' + err.message);
      }
    } finally {
      setIsLoadingReport(false);
    }
  };

  const downloadPDF = () => {
    const url = `${API_URL}/ardoise/sales/export-pdf/${token}?period=${reportPeriod}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };

  const downloadExcel = () => {
    const url = `${API_URL}/ardoise/sales/export-excel/${token}?period=${reportPeriod}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };

  const updateItem = (section: 'entree' | 'plat' | 'dessert', index: number, field: string, value: any) => {
    if (!editingData) return;
    const updated = { ...editingData };
    updated[section][index][field] = value;
    setEditingData(updated);
  };

  const updateFormulePrice = (key: keyof FormulePrices, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditingFormulePrices(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const formatPrice = (price: number) => {
    return price.toFixed(2).replace('.', ',') + '€';
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffd166" />
        <Text style={styles.loadingText}>Chargement de l'ardoise...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning-outline" size={64} color="#ff6b6b" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadArdoise}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>A L'ARDOISE</Text>
        <Text style={styles.restaurantName}>{ardoiseData?.restaurant_name}</Text>
        {ardoiseData?.updated_at && (
          <Text style={styles.lastUpdate}>
            Dernière mise à jour : {formatDate(ardoiseData.updated_at)}
          </Text>
        )}
      </View>

      {/* Mode Toggle Buttons */}
      <View style={styles.modeButtons}>
        <TouchableOpacity 
          style={[styles.modeButton, isEditing && styles.modeButtonActive]}
          onPress={() => { setIsEditing(!isEditing); setShowSalesMode(false); setShowReportsMode(false); }}
          data-testid="toggle-edit-mode"
        >
          <Ionicons name={isEditing ? 'eye-outline' : 'pencil'} size={18} color="white" />
          <Text style={styles.modeButtonText}>
            {isEditing ? 'Aperçu' : 'Édition'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.modeButton, styles.salesButton, showSalesMode && styles.modeButtonActive]}
          onPress={() => { setShowSalesMode(!showSalesMode); setIsEditing(false); setShowReportsMode(false); }}
          data-testid="toggle-sales-mode"
        >
          <Ionicons name="restaurant" size={18} color="white" />
          <Text style={styles.modeButtonText}>
            {showSalesMode ? 'Fermer' : 'Ventes'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.modeButton, styles.reportsButton, showReportsMode && styles.modeButtonActive]}
          onPress={() => { 
            setShowReportsMode(!showReportsMode); 
            setIsEditing(false); 
            setShowSalesMode(false);
            if (!showReportsMode && !reportData) loadReport('week');
          }}
          data-testid="toggle-reports-mode"
        >
          <Ionicons name="bar-chart" size={18} color="white" />
          <Text style={styles.modeButtonText}>
            {showReportsMode ? 'Fermer' : 'Rapports'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Reports Mode */}
      {showReportsMode && (
        <View style={styles.reportsContainer}>
          <Text style={styles.reportsTitle}>Rapports de Ventes</Text>
          
          {/* Period Selection */}
          <View style={styles.periodButtons}>
            {(['day', 'week', 'month'] as const).map((period) => (
              <TouchableOpacity
                key={period}
                style={[styles.periodButton, reportPeriod === period && styles.periodButtonActive]}
                onPress={() => loadReport(period)}
                data-testid={`period-${period}`}
              >
                <Text style={[styles.periodButtonText, reportPeriod === period && styles.periodButtonTextActive]}>
                  {period === 'day' ? "Aujourd'hui" : period === 'week' ? '7 jours' : '30 jours'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {isLoadingReport ? (
            <ActivityIndicator size="large" color="#27ae60" style={{ marginVertical: 20 }} />
          ) : reportData ? (
            <>
              {/* Summary Cards */}
              <View style={styles.summaryCards}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNumber}>{reportData.total_services}</Text>
                  <Text style={styles.summaryLabel}>Services</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNumber}>{reportData.totals?.total || 0}</Text>
                  <Text style={styles.summaryLabel}>Plats vendus</Text>
                </View>
              </View>
              
              {/* Category Breakdown */}
              <View style={styles.categoryBreakdown}>
                <View style={styles.categoryItem}>
                  <Text style={styles.categoryLabel}>Entrées</Text>
                  <Text style={styles.categoryValue}>{reportData.totals?.entrees || 0}</Text>
                </View>
                <View style={styles.categoryItem}>
                  <Text style={styles.categoryLabel}>Plats</Text>
                  <Text style={styles.categoryValue}>{reportData.totals?.plats || 0}</Text>
                </View>
                <View style={styles.categoryItem}>
                  <Text style={styles.categoryLabel}>Desserts</Text>
                  <Text style={styles.categoryValue}>{reportData.totals?.desserts || 0}</Text>
                </View>
              </View>
              
              {/* Top Items */}
              {reportData.top_items?.length > 0 && (
                <View style={styles.topItemsSection}>
                  <Text style={styles.topItemsTitle}>Top des ventes</Text>
                  {reportData.top_items.slice(0, 5).map((item: any, idx: number) => (
                    <View key={idx} style={styles.topItem}>
                      <Text style={styles.topItemRank}>#{idx + 1}</Text>
                      <Text style={styles.topItemName}>{item.name}</Text>
                      <Text style={styles.topItemQty}>{item.total_qty}</Text>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Export Buttons */}
              <View style={styles.exportButtons}>
                <TouchableOpacity 
                  style={[styles.exportButton, styles.exportPdfButton]}
                  onPress={downloadPDF}
                  data-testid="export-pdf-btn"
                >
                  <Ionicons name="document-text" size={20} color="white" />
                  <Text style={styles.exportButtonText}>Export PDF</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.exportButton, styles.exportExcelButton]}
                  onPress={downloadExcel}
                  data-testid="export-excel-btn"
                >
                  <Ionicons name="grid" size={20} color="white" />
                  <Text style={styles.exportButtonText}>Export Excel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>Aucune donnée de vente disponible</Text>
          )}
        </View>
      )}

      {/* Sales Mode */}
      {showSalesMode && (
        <View style={styles.salesContainer}>
          <Text style={styles.salesTitle}>Enregistrer les ventes du service</Text>
          <Text style={styles.salesSubtitle}>Saisissez les quantités vendues pour chaque plat</Text>
          
          {(['entree', 'plat', 'dessert'] as const).map((section) => (
            <View key={section} style={styles.sectionEdit}>
              <Text style={styles.sectionTitle}>
                {section === 'entree' ? 'ENTRÉE' : section.toUpperCase()}
              </Text>
              {editingData?.[section]?.map((item: ArdoiseItem, idx: number) => (
                item.name ? (
                  <View key={`${section}-${idx}`} style={styles.salesItemRow}>
                    <Text style={styles.salesItemName}>{item.name}</Text>
                    <View style={styles.quantityInputContainer}>
                      <Text style={styles.quantityLabel}>Qté:</Text>
                      <TextInput
                        style={styles.quantityInput}
                        placeholder="0"
                        placeholderTextColor="#888"
                        keyboardType="numeric"
                        value={item.quantity_sold?.toString() || ''}
                        onChangeText={(text) => updateItem(section, idx, 'quantity_sold', parseInt(text) || null)}
                        data-testid={`quantity-${section}-${idx}`}
                      />
                    </View>
                  </View>
                ) : null
              ))}
            </View>
          ))}

          <TouchableOpacity 
            style={[styles.saveButton, styles.saveSalesButton, isSaving && styles.saveButtonDisabled]}
            onPress={saveSales}
            disabled={isSaving}
            data-testid="save-sales-btn"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="white" />
                <Text style={styles.saveSalesButtonText}>Valider les ventes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Edit Mode */}
      {isEditing && !showSalesMode && (
        <View style={styles.editContainer}>
          {(['entree', 'plat', 'dessert'] as const).map((section) => (
            <View key={section} style={styles.sectionEdit}>
              <Text style={styles.sectionTitle}>
                {section === 'entree' ? 'ENTRÉE' : section.toUpperCase()}
              </Text>
              {editingData?.[section]?.map((item: ArdoiseItem, idx: number) => (
                <View key={`${section}-${idx}`} style={styles.itemEdit}>
                  <Text style={styles.itemLabel}>Item {idx + 1}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nom du plat"
                    placeholderTextColor="#888"
                    value={item.name}
                    onChangeText={(text) => updateItem(section, idx, 'name', text)}
                    data-testid={`input-${section}-${idx}-name`}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Description (optionnelle)"
                    placeholderTextColor="#888"
                    value={item.description}
                    onChangeText={(text) => updateItem(section, idx, 'description', text)}
                    data-testid={`input-${section}-${idx}-description`}
                  />
                </View>
              ))}
            </View>
          ))}

          {/* Formule Prices Section */}
          <View style={styles.formulesEditSection}>
            <View style={styles.formulesEditHeader}>
              <Text style={styles.sectionTitle}>PRIX DES FORMULES</Text>
              <Ionicons name="pencil" size={16} color="#ffd166" />
            </View>
            
            <View style={styles.formuleEditItem}>
              <Text style={styles.formuleEditLabel}>Plat du jour</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="decimal-pad"
                value={editingFormulePrices.plat_du_jour.toString()}
                onChangeText={(text) => updateFormulePrice('plat_du_jour', text)}
                data-testid="price-plat-du-jour"
              />
              <Text style={styles.euroSign}>€</Text>
            </View>
            
            <View style={styles.formuleEditItem}>
              <Text style={styles.formuleEditLabel}>Entrée + Plat</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="decimal-pad"
                value={editingFormulePrices.entree_plat.toString()}
                onChangeText={(text) => updateFormulePrice('entree_plat', text)}
                data-testid="price-entree-plat"
              />
              <Text style={styles.euroSign}>€</Text>
            </View>
            
            <View style={styles.formuleEditItem}>
              <Text style={styles.formuleEditLabel}>Plat + Dessert</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="decimal-pad"
                value={editingFormulePrices.plat_dessert.toString()}
                onChangeText={(text) => updateFormulePrice('plat_dessert', text)}
                data-testid="price-plat-dessert"
              />
              <Text style={styles.euroSign}>€</Text>
            </View>
            
            <View style={styles.formuleEditItem}>
              <Text style={styles.formuleEditLabel}>Entrée + Plat + Dessert</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="decimal-pad"
                value={editingFormulePrices.entree_plat_dessert.toString()}
                onChangeText={(text) => updateFormulePrice('entree_plat_dessert', text)}
                data-testid="price-entree-plat-dessert"
              />
              <Text style={styles.euroSign}>€</Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity 
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={saveArdoise}
            disabled={isSaving}
            data-testid="save-ardoise-btn"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#2d3436" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#2d3436" />
                <Text style={styles.saveButtonText}>Valider les modifications</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* View Mode */}
      {!isEditing && !showSalesMode && (
        <View style={styles.viewContainer}>
          {(['entree', 'plat', 'dessert'] as const).map((section) => (
            <View key={section} style={styles.sectionView}>
              <Text style={styles.sectionTitleView}>
                {section === 'entree' ? 'ENTRÉE' : section.toUpperCase()}
              </Text>
              {ardoiseData?.[section]?.map((item, idx) => (
                <View key={`${section}-${idx}`} style={styles.itemView}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name || '—'}</Text>
                    {item.description && (
                      <Text style={styles.itemDescription}>{item.description}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
          
          {/* Section FORMULES - avec icône stylo */}
          <View style={styles.formulesSection}>
            <View style={styles.formulesTitleContainer}>
              <Text style={styles.formulesTitleView}>FORMULES</Text>
              <TouchableOpacity 
                onPress={() => setIsEditing(true)}
                style={styles.editFormuleIcon}
                data-testid="edit-formules-btn"
              >
                <Ionicons name="pencil" size={16} color="#ffd166" />
              </TouchableOpacity>
            </View>
            <View style={styles.formuleItem}>
              <Text style={styles.formuleName}>Plat du jour</Text>
              <Text style={styles.formulePrice}>{formatPrice(ardoiseData?.formule_prices?.plat_du_jour || 15.90)}</Text>
            </View>
            <View style={styles.formuleItem}>
              <Text style={styles.formuleName}>Entrée + Plat</Text>
              <Text style={styles.formulePrice}>{formatPrice(ardoiseData?.formule_prices?.entree_plat || 18.90)}</Text>
            </View>
            <View style={styles.formuleItem}>
              <Text style={styles.formuleName}>Plat + Dessert</Text>
              <Text style={styles.formulePrice}>{formatPrice(ardoiseData?.formule_prices?.plat_dessert || 18.90)}</Text>
            </View>
            <View style={styles.formuleItem}>
              <Text style={styles.formuleName}>Entrée + Plat + Dessert</Text>
              <Text style={styles.formulePrice}>{formatPrice(ardoiseData?.formule_prices?.entree_plat_dessert || 23.90)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Ce lien est permanent. Les modifications sont appliquées immédiatement.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2d3436',
  },
  contentContainer: {
    padding: 20,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#2d3436',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffd166',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#2d3436',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#ffd166',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#2d3436',
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffd166',
    letterSpacing: 2,
    marginBottom: 8,
  },
  restaurantName: {
    fontSize: 18,
    color: '#dfe6e9',
    fontStyle: 'italic',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 8,
  },
  modeButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  salesButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.3)',
  },
  reportsButton: {
    backgroundColor: 'rgba(39, 174, 96, 0.3)',
  },
  modeButtonActive: {
    backgroundColor: '#3498db',
  },
  modeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  // Reports Mode Styles
  reportsContainer: {
    backgroundColor: 'rgba(39, 174, 96, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(39, 174, 96, 0.3)',
  },
  reportsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#27ae60',
    textAlign: 'center',
    marginBottom: 16,
  },
  periodButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  periodButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(39, 174, 96, 0.5)',
  },
  periodButtonActive: {
    backgroundColor: '#27ae60',
    borderColor: '#27ae60',
  },
  periodButtonText: {
    color: '#b2bec3',
    fontSize: 13,
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: 'white',
  },
  summaryCards: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  summaryCard: {
    backgroundColor: 'rgba(39, 174, 96, 0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#27ae60',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#b2bec3',
    marginTop: 4,
  },
  categoryBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  categoryItem: {
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: 12,
    color: '#b2bec3',
  },
  categoryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 4,
  },
  topItemsSection: {
    marginBottom: 20,
  },
  topItemsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
  },
  topItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  topItemRank: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#27ae60',
    width: 30,
  },
  topItemName: {
    flex: 1,
    fontSize: 14,
    color: 'white',
  },
  topItemQty: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffd166',
  },
  exportButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  exportPdfButton: {
    backgroundColor: '#e74c3c',
  },
  exportExcelButton: {
    backgroundColor: '#27ae60',
  },
  exportButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  noDataText: {
    color: '#b2bec3',
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  // Sales Mode Styles
  salesContainer: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.3)',
  },
  salesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3498db',
    textAlign: 'center',
    marginBottom: 4,
  },
  salesSubtitle: {
    fontSize: 13,
    color: '#b2bec3',
    textAlign: 'center',
    marginBottom: 16,
  },
  salesItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  salesItemName: {
    color: 'white',
    fontSize: 15,
    flex: 1,
  },
  quantityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityLabel: {
    color: '#b2bec3',
    fontSize: 13,
  },
  quantityInput: {
    backgroundColor: '#3d4849',
    color: '#3498db',
    padding: 8,
    borderRadius: 6,
    width: 60,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    borderWidth: 1,
    borderColor: '#3498db',
  },
  saveSalesButton: {
    backgroundColor: '#3498db',
    marginTop: 16,
  },
  saveSalesButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Edit Mode Styles
  editContainer: {},
  sectionEdit: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffd166',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,209,102,0.3)',
    paddingBottom: 8,
  },
  itemEdit: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  itemLabel: {
    color: '#b2bec3',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#3d4849',
    color: 'white',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#555',
    marginBottom: 8,
    fontSize: 15,
  },
  // Formules Edit Styles
  formulesEditSection: {
    backgroundColor: 'rgba(255,209,102,0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.3)',
  },
  formulesEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  formuleEditItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  formuleEditLabel: {
    color: 'white',
    fontSize: 14,
    flex: 1,
  },
  priceInput: {
    backgroundColor: '#3d4849',
    color: '#ffd166',
    padding: 10,
    borderRadius: 6,
    width: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: 'bold',
    borderWidth: 1,
    borderColor: '#ffd166',
  },
  euroSign: {
    color: '#ffd166',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffd166',
    paddingVertical: 16,
    borderRadius: 10,
    marginTop: 12,
    gap: 10,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#2d3436',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // View Mode Styles
  viewContainer: {},
  sectionView: {
    marginBottom: 24,
  },
  sectionTitleView: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffd166',
    marginBottom: 12,
    textAlign: 'center',
  },
  itemView: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  itemDescription: {
    color: '#b2bec3',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Formules Section Styles
  formulesSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 2,
    borderTopColor: '#ffd166',
  },
  formulesTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  formulesTitleView: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffd166',
    textAlign: 'center',
  },
  editFormuleIcon: {
    padding: 4,
    backgroundColor: 'rgba(255,209,102,0.2)',
    borderRadius: 4,
  },
  formuleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  formuleName: {
    color: 'white',
    fontSize: 16,
  },
  formulePrice: {
    color: '#ffd166',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: '#636e72',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
