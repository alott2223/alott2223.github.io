// Firestore Security Rules - Copy these into Firebase Console > Firestore > Rules
// 
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     
//     // Users collection
//     match /users/{userId} {
//       allow read: if request.auth != null;
//       allow create: if request.auth != null && request.auth.uid == userId;
//       allow update: if request.auth != null && (request.auth.uid == userId || isAdmin());
//       allow delete: if request.auth != null && isAdmin();
//     }
//     
//     // Posts collection
//     match /posts/{postId} {
//       allow read: if true;
//       allow create: if request.auth != null;
//       allow update: if request.auth != null;
//       allow delete: if request.auth != null && 
//         (resource.data.authorId == request.auth.uid || isAdmin());
//       
//       // Comments subcollection
//       match /comments/{commentId} {
//         allow read: if true;
//         allow create: if request.auth != null;
//         allow delete: if request.auth != null && isAdmin();
//       }
//     }
//     
//     // Reports collection
//     match /reports/{reportId} {
//       allow read: if request.auth != null && isAdmin();
//       allow create: if request.auth != null;
//       allow update: if request.auth != null && isAdmin();
//     }
//     
//     // Notifications collection
//     match /notifications/{notifId} {
//       allow read: if request.auth != null && resource.data.targetUid == request.auth.uid;
//       allow create: if request.auth != null;
//       allow update: if request.auth != null && resource.data.targetUid == request.auth.uid;
//     }
//     
//     // Config collection
//     match /config/{doc} {
//       allow read: if true;
//       allow write: if request.auth != null && isAdmin();
//     }
//     
//     // Helper function to check admin role
//     function isAdmin() {
//       return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
//     }
//   }
// }
