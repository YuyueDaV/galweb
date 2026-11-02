import { createPool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise'
import type { Config } from './config'
export class Database {
  readonly pool
  constructor(c:Config){this.pool=createPool({host:c.DB_HOST,port:c.DB_PORT,user:c.DB_USER,password:c.DB_PASSWORD,database:c.DB_NAME,connectionLimit:10,charset:'utf8mb4',timezone:'Z',dateStrings:true})}
  async rows<T=Record<string,unknown>>(sql:string,values:(string|number|boolean|null)[]=[],tx?:PoolConnection):Promise<T[]> {const [rows]=await (tx||this.pool).execute<RowDataPacket[]>(sql,values);return rows as T[]}
  async execute(sql:string,values:(string|number|boolean|null)[]=[],tx?:PoolConnection){const [result]=await (tx||this.pool).execute<ResultSetHeader>(sql,values);return result}
  async transaction<T>(fn:(tx:PoolConnection)=>Promise<T>):Promise<T>{const tx=await this.pool.getConnection();try{await tx.beginTransaction();const result=await fn(tx);await tx.commit();return result}catch(e){await tx.rollback();throw e}finally{tx.release()}}
}
