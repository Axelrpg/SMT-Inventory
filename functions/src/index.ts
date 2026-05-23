import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();

export const createUser = onCall(
    {
        cors: ['https://inventory-cfba7.web.app', 'http://localhost:4200'],
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'No autenticado');
        }

        const callerDoc = await admin.firestore()
            .doc(`users/${request.auth.uid}`)
            .get();

        if (callerDoc.data()?.role !== 'admin') {
            throw new HttpsError('permission-denied', 'Solo admins pueden crear usuarios');
        }

        const { email, password, displayName, role } = request.data;

        const userRecord = await admin.auth().createUser({ email, password, displayName });

        await admin.firestore().doc(`users/${userRecord.uid}`).set({
            uid: userRecord.uid,
            email,
            displayName,
            role: role || 'user',
            createdAt: FieldValue.serverTimestamp(),
            createdBy: request.auth.uid
        });

        return { uid: userRecord.uid, message: 'Usuario creado exitosamente' };
    }
);

export const updateUser = onCall(
    {
        cors: ['https://inventory-cfba7.web.app', 'http://localhost:4200'],
        invoker: 'public',
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'No autenticado');
        }

        const callerDoc = await admin.firestore()
            .doc(`users/${request.auth.uid}`)
            .get();

        if (callerDoc.data()?.role !== 'admin') {
            throw new HttpsError('permission-denied', 'Solo admins pueden editar usuarios');
        }

        const { uid, email, displayName, role, roleId } = request.data;

        const authUpdate: any = {};
        if (email) authUpdate.email = email;
        if (displayName) authUpdate.displayName = displayName;

        if (Object.keys(authUpdate).length > 0) {
            await admin.auth().updateUser(uid, authUpdate);
        }

        const firestoreUpdate: any = {};
        if (email) firestoreUpdate.email = email;
        if (displayName) firestoreUpdate.displayName = displayName;
        if (role) firestoreUpdate.role = role;
        if (roleId !== undefined) firestoreUpdate.roleId = roleId;

        if (Object.keys(firestoreUpdate).length > 0) {
            firestoreUpdate.updatedAt = FieldValue.serverTimestamp();
            firestoreUpdate.updatedBy = request.auth.uid;
            await admin.firestore().doc(`users/${uid}`).update(firestoreUpdate);
        }

        return { message: 'Usuario actualizado correctamente' };
    }
);

export const deleteUser = onCall(
    {
        cors: ['https://inventory-cfba7.web.app', 'http://localhost:4200'],
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'No autenticado');
        }

        const callerDoc = await admin.firestore()
            .doc(`users/${request.auth.uid}`)
            .get();

        if (callerDoc.data()?.role !== 'admin') {
            throw new HttpsError('permission-denied', 'Solo admins pueden eliminar usuarios');
        }

        const { uid } = request.data;

        await admin.auth().deleteUser(uid);
        await admin.firestore().doc(`users/${uid}`).delete();

        return { message: 'Usuario eliminado exitosamente' };
    }
);