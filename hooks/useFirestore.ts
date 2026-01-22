
import { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  getDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { Project } from '../types';

export const useFirestore = (uid?: string) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Real-time listener for user's projects
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs: Project[] = [];
      snapshot.forEach((doc) => {
        projs.push({ id: doc.id, ...doc.data() } as Project);
      });
      setProjects(projs);
      setLoading(false);
    }, (err) => {
      console.error("Firestore projects sync error:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  const createProject = async (project: Omit<Project, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        ...project,
        createdAt: Date.now(),
        updatedAt: Timestamp.now()
      });
      return docRef.id;
    } catch (err: any) {
      console.error("Failed to create project:", err);
      throw err;
    }
  };

  const updateProject = async (projectId: string, updates: Partial<Project>) => {
    try {
      const docRef = doc(db, 'projects', projectId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.now()
      });
    } catch (err: any) {
      console.error("Failed to update project:", err);
      throw err;
    }
  };

  const getProject = async (projectId: string) => {
    try {
      const docRef = doc(db, 'projects', projectId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Project;
      }
      return null;
    } catch (err: any) {
      console.error("Failed to get project:", err);
      throw err;
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      throw err;
    }
  };

  return { projects, loading, error, createProject, updateProject, getProject, deleteProject };
};
