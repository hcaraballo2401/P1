import AsyncStorage from '@react-native-async-storage/async-storage';

const IDENTIFICATIONS_KEY = '@biolife_identifications';
const PROFILE_IMAGE_KEY = '@biolife_profile_image';
const PROFILE_DATA_KEY = '@biolife_profile_data';

export interface ProfileData {
  name: string;
  bio: string;
}

export interface IdentificationRecord {
  id: string;
  uri: string;
  species: string;
  confidence: number;
  date: string;
}

/**
 * Guarda una nueva identificación en el historial local.
 */
export const saveIdentification = async (record: IdentificationRecord): Promise<void> => {
  try {
    const existingData = await getIdentifications();
    const updatedData = [record, ...existingData];
    await AsyncStorage.setItem(IDENTIFICATIONS_KEY, JSON.stringify(updatedData));
  } catch (error) {
    console.error('Error saving identification:', error);
  }
};

/**
 * Recupera todo el historial de identificaciones.
 */
export const getIdentifications = async (): Promise<IdentificationRecord[]> => {
  try {
    const data = await AsyncStorage.getItem(IDENTIFICATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting identifications:', error);
    return [];
  }
};

/**
 * Borra todo el historial (opcional, para mantenimiento).
 */
export const clearIdentifications = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(IDENTIFICATIONS_KEY);
  } catch (error) {
    console.error('Error clearing identifications:', error);
  }
};

/**
 * Guarda la URI de la foto de perfil.
 */
export const saveProfileImage = async (uri: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(PROFILE_IMAGE_KEY, uri);
  } catch (error) {
    console.error('Error saving profile image:', error);
  }
};

/**
 * Recupera la URI de la foto de perfil.
 */
export const getProfileImage = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(PROFILE_IMAGE_KEY);
  } catch (error) {
    console.error('Error getting profile image:', error);
    return null;
  }
};

/**
 * Guarda los datos del perfil (nombre y bio).
 */
export const saveProfileData = async (data: ProfileData): Promise<void> => {
  try {
    await AsyncStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving profile data:', error);
  }
};

/**
 * Recupera los datos del perfil.
 */
export const getProfileData = async (): Promise<ProfileData | null> => {
  try {
    const data = await AsyncStorage.getItem(PROFILE_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting profile data:', error);
    return null;
  }
};
