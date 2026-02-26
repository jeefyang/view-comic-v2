type JFetchReturnType = {
    code: 200 | 401 | 500 | 666;
    msg?: string;
    data?: any;
    err?: any;
};