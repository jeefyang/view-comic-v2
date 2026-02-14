import { Router } from 'express';
import { useConfigApi } from './configApi';
import { useUserApi } from './userApi';
import { JRoute } from '../utils/jroute';

const router: Router = Router();
const jroute=new JRoute(router);


useConfigApi(jroute)
useUserApi(jroute)

export default router;