import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync } from 'fs';

export const uniqueFileNameGenerator = (filename: string) => {
    const extention = filename.split(".");
  
    return {
      name: uuidv4(),
      ext: extention[extention.length - 1],
    };
}; 

export const foldersExist = (folders: string[]) => {
    for (const folder of folders) {
      if (!existsSync(folder)) {
        return false;
      }
    }
  
    return true;
};

export const createFolders = (folders: string[]) => {
    for (const folder of folders) {
      if (!existsSync(folder)) {
        mkdirSync(folder, { recursive: true });
      }
    }
};
export const moveFile = (file: any, path: string) =>
  new Promise((resolve, reject) => {
    file.mv(path, (err: any) => {
      if (err) reject(err.message);

      resolve(1);
    });
  });