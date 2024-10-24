import { Dropbox } from 'dropbox';
import { getEnvVariables } from './env';

let dropbox: Dropbox | null = null;

export const getDropboxClient = async (): Promise<Dropbox> => {
  if (!dropbox) {
    const { DROPBOX_ACCESS_TOKEN } = await getEnvVariables();
    
    if (typeof window !== 'undefined') {
      dropbox = new Dropbox({ 
        accessToken: DROPBOX_ACCESS_TOKEN,
        fetch: fetch.bind(window)
      });
    } else {
      dropbox = new Dropbox({ 
        accessToken: DROPBOX_ACCESS_TOKEN
      });
    }
  }
  return dropbox;
};
