import 'dotenv/config';

const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID;
const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;

// Google's iOS OAuth flow redirects back to the app via a URL scheme that is
// the "reversed" iOS client ID. e.g. a client ID
//   875545166759-xxxx.apps.googleusercontent.com
// becomes the scheme
//   com.googleusercontent.apps.875545166759-xxxx
// Expo adds this to Info.plist's CFBundleURLSchemes when we set it under
// ios.config.googleSignIn.reservedClientId.
const reversedIosClientId = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

export default {
  expo: {
    name: "Amherst Connect",
    slug: "amherstconnect",
    owner: "briann923",
    scheme: "amherstconnect",
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
        ...(reversedIosClientId && {
          googleSignIn: { reservedClientId: reversedIosClientId },
        }),
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
      // expo-auth-session's Google provider redirects to
      //   <applicationId>:/oauthredirect
      // (see node_modules/expo-auth-session/build/providers/Google.js).
      // Android won't route that URL back to the app unless we register
      // an intent filter for the applicationId scheme. This filter must
      // be in the native manifest, so changes here require a rebuild.
      intentFilters: [
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: "com.buildumass.amherstconnect" }],
        },
      ],
    },
    extra: {
      firebaseApiKey:            process.env.FIREBASE_API_KEY,
      firebaseAuthDomain:        process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId:         process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId:             process.env.FIREBASE_APP_ID,
      googleWebClientId:         process.env.GOOGLE_WEB_CLIENT_ID,
      googleIosClientId,
      googleAndroidClientId,
      eas: {
        projectId: "6bdab312-be70-4f12-a2de-c138acf27809",
      },
    },
    plugins: [
      "expo-web-browser",
    ],
  },
};
