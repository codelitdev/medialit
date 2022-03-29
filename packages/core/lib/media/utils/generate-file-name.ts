import getUniqueId from "../../utils/unique-id";

export default function generateFileName (filename: string): {
    name: string;
    ext: string;
} {
    const extention = filename.split(".");
  
    return {
      name: getUniqueId(),
      ext: extention[extention.length - 1],
    };
}; 