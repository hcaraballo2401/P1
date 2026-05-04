import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

interface WildlifePlayerProps {
  videoId: string;
}

export default function WildlifePlayer({ videoId }: WildlifePlayerProps) {
  const [isReady, setIsReady] = useState(false);
  const windowWidth = Dimensions.get('window').width;
  
  // Calcular proporción 16:9 basándonos en el ancho (restando padding)
  const containerWidth = windowWidth - 32; 
  const playerHeight = (containerWidth * 9) / 16;

  return (
    <View style={[styles.container, { height: playerHeight, width: containerWidth }]}>
      {!isReady && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
        </View>
      )}
      <WebView
        style={{ flex: 1, backgroundColor: '#000' }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onLoad={() => setIsReady(true)}
        source={{ 
          uri: `https://www.youtube.com/embed/${videoId}?playsinline=1&controls=1&modestbranding=1&rel=0` 
        }}
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    zIndex: 1,
  },
});
