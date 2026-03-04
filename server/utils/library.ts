import path from 'path';
import fs from "fs";
import { LIBRARY_FILE } from "../utils/cache";

export function getList(): { name: string; }[] {
    if (!fs.existsSync(LIBRARY_FILE)) {
        fs.writeFileSync(LIBRARY_FILE, JSON.stringify([], null, 4));
        return [];
    }
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
};

export function saveLib(target: { name: string; }) {
    const list = getList();
    const index = list.findIndex(item => item.name == target.name);
    if (index == -1) {
        list.splice(0, 0, target);
        fs.writeFileSync(LIBRARY_FILE, JSON.stringify(list, null, 4));
        return true;
    }
    return false;
};

export function removeLib(target: { name: string; }) {
    const list = getList();
    const index = list.findIndex(item => item.name == target.name);
    if (index == -1) {
        return false;
    }
    list.splice(index, 1);
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(list, null, 4));
    return true;
};

export function editLib(target: { name: string; }) {
    const list = getList();
    const index = list.findIndex(item => item.name == target.name);
    if (index == -1) {
        return false;
    }
    list[index] = target;
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(list, null, 4));
    return true;
};