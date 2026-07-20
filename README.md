# Emergency Alert System – Web App

Web app for **Smart Vehicle Accident Detection and Emergency Alert System**. Used by Admin, Police, and Suwa Seriya (ambulance) to receive real-time accident alerts and track response status.

## Features

- **Login & Sign up**: Email/password authentication; on sign up you choose your role (Admin, Police, or Suwa Seriya).
- **Admin dashboard**: Monitor all alerts; see **color indicators** for Police and Suwa Seriya (Not responded = red, En route = amber, Arrived = green). Create test alerts for demo.
- **Police dashboard**: Real-time **popup alert** when a new accident is reported; mark "I'm en route" / "Arrived"; open location in Google Maps.
- **Suwa Seriya dashboard**: Same as Police for ambulance crew.
- **Responsive**: Works on desktop and mobile.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Firebase Authentication**  
   In [Firebase Console](https://console.firebase.google.com) → your project → **Authentication** → **Sign-in method** → enable **Email/Password**.

3. **Firebase Realtime Database rules (important)**  
   This app uses **Realtime Database**, not Firestore. If you see "Permission denied" when logging in, the rules are missing or in the wrong place.  
   In Firebase Console: **Build** → **Realtime Database** (not "Firestore") → **Rules** tab. Replace the rules with the contents of `database.rules.json` (or paste below), then click **Publish**. This allows read/write for `alerts` and lets signed-in users read/write their own profile under `users/{uid}`.

   ```json
   {
     "rules": {
       "alerts": { ".read": true, ".write": true },
       "users": {
         "$uid": {
           ".read": "auth != null && auth.uid == $uid",
           ".write": "auth != null && auth.uid == $uid"
         }
       }
     }
   }
   ```

4. **Run the app**
   ```bash
   npm run dev
   ```
   Open the URL shown (e.g. http://localhost:5173). Sign up with email/password and choose a role, or sign in to open your dashboard.

## Demo for mid-review

1. **Sign up** two accounts: one as Admin, one as Police or Suwa Seriya (use two browsers or incognito).
2. In the Admin window: click **"Create test alert (demo)"**.
3. In the Police/Suwa Seriya window: a **popup alert** should appear.
4. In Admin, watch the **color indicators** change as Police/Suwa Seriya set "En route" or "Arrived".

