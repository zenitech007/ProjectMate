
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  isPremium: boolean;
  credits: number;
  lifetime_projects?: number;
}

export interface Chapter {
  title: string;
  content: string;
  status: 'empty' | 'pending' | 'completed';
}

export interface ProjectOutline {
  title: string;
  sections: string[];
}

export interface ProjectSettings {
  showPageNumbers: boolean;
  showHeader: boolean;
  academicFormat: 'standard' | 'modern';
}

export enum InstitutionType {
  UNIVERSITY = 'University',
  POLYTECHNIC = 'Polytechnic',
  COLLEGE_OF_EDUCATION = 'College of Education'
}

export interface Project {
  id: string;
  userId: string;
  topic: string;
  studentName: string;
  matricNumber: string;
  supervisorName: string;
  institutionType: InstitutionType;
  institutionName: string;
  faculty: string;
  department: string;
  chapters: Record<string, Chapter>;
  outline: ProjectOutline[];
  settings: ProjectSettings;
  status: 'draft' | 'completed';
  createdAt: number;
}

export interface TopicHistoryItem {
  id: string;
  userId: string;
  faculty: string;
  department: string;
  topics: { title: string; brief: string }[];
  createdAt: number;
}

export const Faculty = [
  'Arts', 'Social Sciences', 'Science', 'Engineering', 'Law', 
  'Business Administration', 'Education', 'Environmental Sciences', 
  'Clinical Sciences', 'Basic Medical Sciences', 'Agriculture'
];

export const Departments: Record<string, string[]> = {
  'Arts': ['History', 'Philosophy', 'English', 'Linguistics', 'Theatre Arts'],
  'Social Sciences': ['Economics', 'Political Science', 'Sociology', 'Psychology', 'Geography', 'Mass Communication'],
  'Science': ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Microbiology', 'Biochemistry'],
  'Engineering': ['Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Computer Engineering', 'Chemical Engineering'],
  'Law': ['Common Law', 'Islamic Law', 'Commercial Law'],
  'Business Administration': ['Accounting', 'Banking and Finance', 'Business Administration', 'Marketing'],
  'Education': ['Guidance and Counselling', 'Educational Management', 'Vocational Education'],
  'Environmental Sciences': ['Architecture', 'Estate Management', 'Quantity Surveying', 'Urban and Regional Planning'],
  'Clinical Sciences': ['Medicine and Surgery', 'Nursing Science', 'Medical Laboratory Science'],
  'Basic Medical Sciences': ['Anatomy', 'Physiology'],
  'Agriculture': ['Animal Science', 'Crop Science', 'Soil Science', 'Agricultural Economics']
};
