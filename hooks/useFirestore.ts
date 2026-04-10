
import { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { db } from '../firebase';
import { Project, TopicHistoryItem } from '../types';

export const useFirestore = (uid?: string) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [topicHistory, setTopicHistory] = useState<TopicHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Removed .orderBy() to avoid the requirement for composite indices in Firestore.
    // We handle sorting client-side in the listeners below.
    const qProjects = db.collection('projects')
      .where('userId', '==', uid);

    const qHistory = db.collection('topic_history')
      .where('userId', '==', uid)
      .limit(30); // Fetch a slightly larger batch to allow for effective client-side sorting

    const unsubscribeProjects = qProjects.onSnapshot((snapshot) => {
      const projs: Project[] = [];
      snapshot.forEach((doc) => {
        projs.push({ id: doc.id, ...doc.data() } as Project);
      });
      
      // Client-side sort: Descending by createdAt
      projs.sort((a, b) => b.createdAt - a.createdAt);
      
      setProjects(projs);
    }, (err) => {
      console.error("Firestore projects sync error:", err);
      setError(err.message);
    });

    const unsubscribeHistory = qHistory.onSnapshot((snapshot) => {
      const history: TopicHistoryItem[] = [];
      snapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() } as TopicHistoryItem);
      });
      
      // Client-side sort: Descending by createdAt
      history.sort((a, b) => b.createdAt - a.createdAt);
      
      // Limit to the most recent 10 items
      setTopicHistory(history.slice(0, 10));
      setLoading(false);
    }, (err) => {
      console.error("Firestore history sync error:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => {
      unsubscribeProjects();
      unsubscribeHistory();
    };
  }, [uid]);

  const addTopicHistory = async (faculty: string, department: string, topics: {title: string, brief: string}[]) => {
    if (!uid) return;
    try {
      await db.collection('topic_history').add({
        userId: uid,
        faculty,
        department,
        topics,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error("Failed to save topic history", err);
    }
  };

  const createProject = async (project: Omit<Project, 'id'>) => {
    try {
      const docRef = await db.collection('projects').add({
        ...project,
        createdAt: Date.now(),
        updatedAt: firebase.firestore.Timestamp.now()
      });
      return docRef.id;
    } catch (err: any) {
      console.error("Failed to create project:", err);
      throw err;
    }
  };

  const updateProject = async (projectId: string, updates: Partial<Project>) => {
    try {
      const docRef = db.collection('projects').doc(projectId);
      await docRef.update({
        ...updates,
        updatedAt: firebase.firestore.Timestamp.now()
      });
    } catch (err: any) {
      console.error("Failed to update project:", err);
      throw err;
    }
  };

  const getProject = async (projectId: string) => {
    try {
      const docRef = db.collection('projects').doc(projectId);
      const snap = await docRef.get();
      if (snap.exists) {
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
      await db.collection('projects').doc(projectId).delete();
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      throw err;
    }
  };

  return { projects, topicHistory, loading, error, createProject, updateProject, getProject, deleteProject, addTopicHistory };
};
