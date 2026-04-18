
import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { Project, TopicHistoryItem } from '../types';

export const useFirestore = (uid?: string) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [topicHistory, setTopicHistory] = useState<TopicHistoryItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingProjects || loadingHistory;

  useEffect(() => {
    if (!uid) {
      setLoadingProjects(false);
      setLoadingHistory(false);
      return;
    }

    setLoadingProjects(true);
    setLoadingHistory(true);

    const qProjects = query(
      collection(db, 'projects'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const qHistory = query(
      collection(db, 'topic_history'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
      const projs: Project[] = [];
      snapshot.forEach((doc) => {
        projs.push({ id: doc.id, ...doc.data() } as Project);
      });

      setProjects(projs);
      setLoadingProjects(false);
    }, (err) => {
      console.error("Firestore projects sync error:", err);
      setError(err.message);
      setLoadingProjects(false);
    });

    const unsubscribeHistory = onSnapshot(qHistory, (snapshot) => {
      const history: TopicHistoryItem[] = [];
      snapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() } as TopicHistoryItem);
      });

      setTopicHistory(history.slice(0, 10));
      setLoadingHistory(false);
    }, (err) => {
      console.error("Firestore history sync error:", err);
      setError(err.message);
      setLoadingHistory(false);
    });

    return () => {
      unsubscribeProjects();
      unsubscribeHistory();
    };
  }, [uid]);

  const addTopicHistory = useCallback(async (faculty: string, department: string, topics: { title: string, brief: string }[]) => {
    if (!uid) return;
    try {
      await addDoc(collection(db, 'topic_history'), {
        userId: uid,
        faculty,
        department,
        topics,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error("Failed to save topic history", err);
    }
  }, [uid]);

  const createProject = useCallback(async (project: Omit<Project, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        ...project,
        createdAt: Date.now(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (err: any) {
      console.error("Failed to create project:", err);
      throw err;
    }
  }, []);

  const updateProject = useCallback(async (projectId: string, updates: Partial<Project>) => {
    try {
      const docRef = doc(db, 'projects', projectId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      console.error("Failed to update project:", err);
      throw err;
    }
  }, []);

  const getProject = useCallback(async (projectId: string) => {
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
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      throw err;
    }
  }, []);

  return { projects, topicHistory, loading, error, createProject, updateProject, getProject, deleteProject, addTopicHistory };
};
