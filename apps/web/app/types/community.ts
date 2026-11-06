import type {Work} from './forum'
export interface SiteSettings {title:string;description:string;announcement:string;joinInfo:string;contact:string;links:{name:string,url:string}[];version:number}
export interface LibraryItem {workId:number;state:'wish'|'reading'|'finished';note:string;isPublic:boolean;updatedAt:number;work:Work}
export interface MemberProfile {id:string;nickname:string;signature:string;avatarUrl:string|null;role:string;createdAt:number;stats:{posts:number;replies:number};library:LibraryItem[]}
export interface CommunityEntry {id:string;userId:string;author:string;title:string;content:string;date:string;kind:'moment'|'activity';assetIds:string[];status:'published'|'hidden'}
export interface InboxItem {id:string;kind:string;title:string;link:string;readAt:number|null;createdAt:number}
