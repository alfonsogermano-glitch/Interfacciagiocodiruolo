// Never point destructive fixture/migration tests at an operational database.
export function postgresRaceConfig(env){
 if(env.HG_DISPOSABLE_PG_RACE!=='1')return null;
 if(!env.PGHOST||!env.PGUSER||
  !/^hollowgate_race_[a-z0-9_]{8,40}$/.test(env.PGDATABASE??''))
  throw Error('Race QA requires explicit PGHOST/PGUSER and a dedicated hollowgate_race_* database');
 const port=Number(env.PGPORT??5432);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid race PostgreSQL port');
 return {host:env.PGHOST,port,user:env.PGUSER,database:env.PGDATABASE,
  max:4,connectionTimeoutMillis:3000,idleTimeoutMillis:2000,
  statement_timeout:15000,query_timeout:20000};
}
export async function assertEmptyRaceDatabase(pool,expectedDatabase){
 const {rows}=await pool.query(`SELECT current_database() AS name,
  NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('hollowgate_auth','hollowgate_vtt'))
  AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
    AND c.relkind IN ('r','p','v','m','S','f')) AS empty`);
 if(rows.length!==1||rows[0].name!==expectedDatabase||rows[0].empty!==true)
  throw Error('Race QA refused: database must be dedicated and empty');
}
