import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

interface WildlifePlayerProps {
  videoId: string;
}

export default function WildlifePlayer({ videoId }: WildlifePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const windowWidth = Dimensions.get('window').width;
  
  // Calcular proporción 16:9 basándonos en el ancho (restando padding)
  const containerWidth = windowWidth - 32; 
  const playerHeight = (containerWidth * 9) / 16;

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') {
      setPlaying(false);
    }
  }, []);

  const onReady = useCallback(() => {
    setIsReady(true);
  }, []);

  return (
    <View style={[styles.container, { height: playerHeight, width: containerWidth }]}>
      {!isReady && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" />
        </View>
      )}
      <YoutubePlayer
        height={playerHeight}
        width={containerWidth}
        play={playing}
        videoId={videoId}
        onChangeState={onStateChange}
        onReady={onReady}
        initialPlayerParams={{
          controls: true,
          modestbranding: true,
          preventFullScreen: false,
          iv_load_policy: 3,
          rel: false,
        }}
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
