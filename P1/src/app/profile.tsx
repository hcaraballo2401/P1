import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  getIdentifications,
  IdentificationRecord,
  getProfileImage,
  saveProfileImage,
  getProfileData,
  saveProfileData,
  ProfileData
} from '../utils/storage';

const { width, height } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 60) / 2;

const DEFAULT_PROFILE_PIC = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=500';

export default function ProfileScreen() {
  const router = useRouter();
  const [userPhotos, setUserPhotos] = useState<IdentificationRecord[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<IdentificationRecord[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<IdentificationRecord | null>(null);
  const [profileImage, setProfileImage] = useState<string>(DEFAULT_PROFILE_PIC);
  const [viewProfilePic, setViewProfilePic] = useState(false);

  // Estados para nombre y bio
  const [userName, setUserName] = useState('Sara Papaianni');
  const [userBio, setUserBio] = useState('Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  // Estado para el modo de vista (grid o list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Estados para búsqueda
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Estados temporales para el modal
  const [tempName, setTempName] = useState('');
  const [tempBio, setTempBio] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const history = await getIdentifications();
    setUserPhotos(history);
    setFilteredPhotos(history); // Inicialmente mostrar todas

    const savedPic = await getProfileImage();
    if (savedPic) setProfileImage(savedPic);

    const savedData = await getProfileData();
    if (savedData) {
      setUserName(savedData.name);
      setUserBio(savedData.bio);
    }
  };

  // Lógica de filtrado en tiempo real
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPhotos(userPhotos);
    } else {
      const filtered = userPhotos.filter(photo =>
        photo.species.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPhotos(filtered);
    }
  }, [searchQuery, userPhotos]);

  const handleEditPress = () => {
    setTempName(userName);
    setTempBio(userBio);
    setIsEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!tempName.trim()) {
      Alert.alert('Error', 'El nombre no puede estar vacío.');
      return;
    }

    const newData: ProfileData = {
      name: tempName,
      bio: tempBio,
    };

    setUserName(tempName);
    setUserBio(tempBio);
    await saveProfileData(newData);
    setIsEditModalVisible(false);
  };

  const handleProfilePress = () => {
    Alert.alert(
      'Foto de Perfil',
      '¿Qué deseas hacer?',
      [
        { text: 'Ver foto', onPress: () => setViewProfilePic(true) },
        { text: 'Tomar foto', onPress: takePhoto },
        { text: 'Elegir de galería', onPress: pickImage },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a la cámara.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setProfileImage(uri);
        await saveProfileImage(uri);
      }
    } catch (error) {
      console.error("Error al abrir la cámara:", error);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a la galería.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setProfileImage(uri);
        await saveProfileImage(uri);
      }
    } catch (error) {
      console.error("Error al abrir la galería:", error);
      Alert.alert("Error", "No se pudo abrir la galería.");
    }
  };

  const toggleSearch = () => {
    if (isSearchActive) {
      setSearchQuery('');
    }
    setIsSearchActive(!isSearchActive);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.logoContainer}
            onPress={() => router.replace('/')}
          >
            <View style={styles.logoIcon}>
              <Ionicons name="leaf-outline" size={20} color="#3A4D39" />
            </View>
            <Text style={styles.logoText}>BioLife</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="menu-outline" size={24} color="#000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCardWrapper}>
          <View style={styles.profileCard}>
            <TouchableOpacity
              style={styles.profileImageContainer}
              onPress={handleProfilePress}
            >
              <Image
                source={{ uri: profileImage }}
                style={styles.profileImage}
              />
            </TouchableOpacity>

            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>Rol</Text>
            </View>

            <TouchableOpacity
              style={styles.editButton}
              onPress={handleEditPress}
            >
              <Ionicons name="pencil-outline" size={14} color="#fff" />
              <Text style={styles.editButtonText}>Editar</Text>
            </TouchableOpacity>

            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userSubtitle}>Estudiante Ing. Informatica | UCAB Guayana</Text>

            <View style={styles.bioContainer}>
              <Text style={styles.bioText}>{userBio}</Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity style={styles.tabItem}>
            <Ionicons name="images-outline" size={28} color="#000" />
            <View style={styles.activeTabIndicator} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem}>
            <Ionicons name="heart-outline" size={28} color="#000" />
          </TouchableOpacity>
        </View>

        {/* View Toggle Selector & Search */}
        <View style={styles.viewToggleContainer}>
          <View style={styles.leftToggles}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons name="grid-outline" size={20} color={viewMode === 'grid' ? '#fff' : '#3A4D39'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons name="list-outline" size={20} color={viewMode === 'list' ? '#fff' : '#3A4D39'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.searchButton, isSearchActive && styles.searchButtonActive]}
            onPress={toggleSearch}
          >
            <Ionicons
              name={isSearchActive ? "close-outline" : "search-outline"}
              size={20}
              color={isSearchActive ? "#fff" : "#3A4D39"}
            />
          </TouchableOpacity>
        </View>

        {/* Search Bar Input */}
        {isSearchActive && (
          <View style={styles.searchBarContainer}>
            <TextInput
              style={styles.searchBarInput}
              placeholder="Buscar especie..."
              placeholderTextColor="#A9A9A9"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>
        )}

        {/* Photo Grid / List */}
        <View style={viewMode === 'grid' ? styles.gridContainer : styles.listContainer}>
          {filteredPhotos.length > 0 ? (
            filteredPhotos.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={viewMode === 'grid' ? styles.photoWrapper : styles.listWrapper}
                onPress={() => setSelectedPhoto(item)}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={viewMode === 'grid' ? styles.gridImage : styles.listImage}
                  resizeMode="cover"
                />
                {viewMode === 'grid' ? (
                  <View style={styles.speciesTag}>
                    <Text style={styles.speciesTagText} numberOfLines={1}>
                      {item.species.split(',')[0]}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.listContent}>
                    <Text style={styles.listSpeciesName} numberOfLines={1}>
                      {item.species.split(',')[0]}
                    </Text>
                    <Text style={styles.listDate}>
                      {new Date(item.date).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons
                name={isSearchActive ? "search-outline" : "camera-outline"}
                size={48}
                color="#3A4D39"
                opacity={0.3}
              />
              <Text style={styles.emptyText}>
                {isSearchActive
                  ? `No se encontraron resultados para "${searchQuery}"`
                  : "Aún no has identificado ninguna especie"
                }
              </Text>
            </View>
          )}
        </View>

        {/* Espacio para que el scroll no tape el contenido con la barra inferior */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Full Screen Identification Photo Viewer */}
      <Modal
        visible={!!selectedPhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.closeModalButton}
            onPress={() => setSelectedPhoto(null)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>

          {selectedPhoto && (
            <View style={styles.fullImageContainer}>
              <Image
                source={{ uri: selectedPhoto.uri }}
                style={styles.fullImage}
                resizeMode="contain"
              />
              <View style={styles.modalFooter}>
                <Text style={styles.modalSpeciesName}>
                  {selectedPhoto.species}
                </Text>
                <Text style={styles.modalDate}>
                  {new Date(selectedPhoto.date).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </Text>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Profile Photo Viewer Modal */}
      <Modal
        visible={viewProfilePic}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setViewProfilePic(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.closeModalButton}
            onPress={() => setViewProfilePic(false)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>

          <View style={styles.fullImageContainer}>
            <Image
              source={{ uri: profileImage }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.editModalContent}>
            <Text style={styles.editModalTitle}>Editar Perfil</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nombre</Text>
              <TextInput
                style={styles.textInput}
                value={tempName}
                onChangeText={setTempName}
                placeholder="Escribe tu nombre"
                placeholderTextColor="#A9A9A9"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Biografía</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={tempBio}
                onChangeText={setTempBio}
                placeholder="Cuéntanos algo sobre ti"
                placeholderTextColor="#A9A9A9"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelBtn]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveBtn]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAF2E3', // Verde muy claro de fondo
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoIcon: {
    marginRight: 6,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3A4D39',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 15,
  },
  headerButton: {
    padding: 5,
  },
  profileCardWrapper: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  profileCard: {
    backgroundColor: '#87A384', // Verde medio (ajustado para que resalte)
    borderRadius: 30,
    padding: 20,
    alignItems: 'center',
    paddingTop: 40,
  },
  profileImageContainer: {
    position: 'absolute',
    top: -40,
    width: 100,
    height: 100,
    borderRadius: 35, // Forma orgánica
    borderWidth: 3,
    borderColor: '#E17055', // Color de borde de la foto en la imagen
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  roleBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 4,
    borderRadius: 15,
    marginBottom: 10,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A4D39',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  userSubtitle: {
    fontSize: 12,
    color: '#3A4D39',
    opacity: 0.8,
    marginBottom: 20,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(58, 77, 57, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginBottom: 10,
    gap: 5,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bioContainer: {
    backgroundColor: '#F8FBF6',
    borderRadius: 25,
    paddingVertical: 15,
    paddingHorizontal: 25,
    width: '100%',
  },
  bioText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#000',
    lineHeight: 18,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
    marginTop: 30,
    marginBottom: 20,
  },
  tabItem: {
    alignItems: 'center',
  },
  activeTabIndicator: {
    width: 20,
    height: 3,
    backgroundColor: '#000',
    marginTop: 4,
    borderRadius: 2,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  photoWrapper: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH * 1.2,
    borderRadius: 25,
    marginBottom: 20,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  speciesTag: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(58, 77, 57, 0.7)',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  speciesTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // List View Styles
  listContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  listWrapper: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  listImage: {
    width: 70,
    height: 70,
    borderRadius: 15,
  },
  listContent: {
    flex: 1,
    marginLeft: 15,
  },
  listSpeciesName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3A4D39',
    marginBottom: 4,
  },
  listDate: {
    fontSize: 12,
    color: '#3A4D39',
    opacity: 0.6,
  },
  // View Toggle Styles
  viewToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 15,
  },
  leftToggles: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(58, 77, 57, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#3A4D39',
  },
  searchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(58, 77, 57, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonActive: {
    backgroundColor: '#3A4D39',
  },
  searchBarContainer: {
    paddingHorizontal: 25,
    marginBottom: 15,
  },
  searchBarInput: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
    borderWidth: 1,
    borderColor: 'rgba(58, 77, 57, 0.1)',
  },
  emptyContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    color: '#3A4D39',
    opacity: 0.5,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalButton: {
    position: 'absolute',
    top: 50,
    right: 25,
    zIndex: 10,
    padding: 10,
  },
  fullImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: width,
    height: height * 0.7,
  },
  modalFooter: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  modalSpeciesName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  modalDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  // Edit Modal Styles
  editModalContent: {
    backgroundColor: '#EAF2E3',
    width: '85%',
    borderRadius: 30,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3A4D39',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A4D39',
    marginBottom: 8,
    marginLeft: 4,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    color: '#000',
    borderWidth: 1,
    borderColor: 'rgba(58, 77, 57, 0.1)',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: '#3A4D39',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelBtn: {
    backgroundColor: 'rgba(58, 77, 57, 0.1)',
  },
  cancelBtnText: {
    color: '#3A4D39',
    fontWeight: '600',
    fontSize: 15,
  },
});
