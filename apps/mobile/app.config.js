import 'dotenv/config';

export default {
  expo: {
    name: "Amherst Connect",
    slug: "amherstconnect",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: "com.buildumass.amherstconnect",
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: "com.buildumass.amherstconnect",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
    extra: {
      firebaseApiKey:           process.env.FIREBASE_API_KEY,
      firebaseAuthDomain:       process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId:        process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket:    process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId:            process.env.FIREBASE_APP_ID,
    },
  },
};
