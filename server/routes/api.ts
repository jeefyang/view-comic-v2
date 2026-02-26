import { Router } from 'express';
import { useConfigApi } from './configApi';
import { useUserApi } from './userApi';
import { useLibraryApi } from "./libraryApi";
import { JRoute } from '../utils/jroute';

const router: Router = Router();
const jroute = new JRoute(router);


useConfigApi(jroute);
useUserApi(jroute);
useLibraryApi(jroute);

export default router;