// Firebase is optional. Without a project config, favourites are saved locally.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID", storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", appId: "YOUR_APP_ID"
};
const configured=Object.values(firebaseConfig).every(v=>v && !String(v).startsWith("YOUR_"));
let auth=null,db=null,signInAnonymously=null,onAuthStateChanged=null;
let collection=null,doc=null,setDoc=null,deleteDoc=null,onSnapshot=null;
if(configured){
  const [{initializeApp},a,f]=await Promise.all([
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
  ]);
  const app=initializeApp(firebaseConfig); auth=a.getAuth(app); db=f.getFirestore(app);
  ({signInAnonymously,onAuthStateChanged}=a);
  ({collection,doc,setDoc,deleteDoc,onSnapshot}=f);
}
export {auth,db,signInAnonymously,onAuthStateChanged,collection,doc,setDoc,deleteDoc,onSnapshot};
