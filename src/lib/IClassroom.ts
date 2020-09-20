import { Credentials } from 'google-auth-library';
import { classroom_v1 as ClassroomAPI } from 'googleapis';

export interface IDriveFileData {
  title: string;
  buffer: Buffer;
}

export interface IClassroom {
  createAuthToken(): Promise<Credentials>;
  getAuthToken(): Promise<Credentials>;
  verifyAndUpdateToken(token: string | null | undefined): void;
  authorize(): Promise<void>;
  setCourses(): Promise<void>;
  listAnnouncements(): Promise<ClassroomAPI.Schema$Announcement[]>;
  listCourseWork(): Promise<ClassroomAPI.Schema$CourseWork[]>;
  getCourseById(id: string): ClassroomAPI.Schema$Course | undefined;
  getFile(fileId: string): Promise<IDriveFileData | null>;
}
