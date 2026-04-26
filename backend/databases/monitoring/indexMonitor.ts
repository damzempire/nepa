// Database Index Monitoring Script
// This script provides SQL queries for monitoring database indexes

export const INDEX_MONITORING_QUERIES = {
  // Get index usage statistics
  getIndexUsage: `
    SELECT 
      schemaname,
      tablename,
      indexname,
      num_tup_reads,
      num_tup_fetches,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size
    FROM pg_stat_user_indexes 
    ORDER BY idx_scan DESC, idx_tup_read DESC
  `,

  // Find unused indexes
  getUnusedIndexes: `
    SELECT 
      schemaname,
      tablename,
      indexname,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size
    FROM pg_stat_user_indexes 
    WHERE idx_scan = 0 
    ORDER BY pg_relation_size(indexrelid) DESC
  `,

  // Get slow queries
  getSlowQueries: `
    SELECT 
      query,
      calls,
      total_time,
      mean_time,
      rows,
      100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
    FROM pg_stat_statements 
    WHERE mean_time > 100 
    ORDER BY mean_time DESC 
    LIMIT 10
  `,

  // Get table size statistics
  getTableSizeStats: `
    SELECT 
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
      pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
      (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) / pg_total_relation_size(schemaname||'.'||tablename) * 100 as index_ratio
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
  `,

  // Get index fragmentation
  getIndexFragmentation: `
    SELECT 
      schemaname,
      tablename,
      indexname,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
      pg_stat_get_pages_fetched(indexrelid) as pages_fetched,
      pg_stat_get_pages_returned(indexrelid) as pages_returned
    FROM pg_stat_user_indexes
    ORDER BY (pg_stat_get_pages_fetched(indexrelid) - pg_stat_get_pages_returned(indexrelid)) DESC
  `,

  // Get missing indexes suggestions
  getMissingIndexSuggestions: `
    SELECT 
      schemaname,
      tablename,
      attname,
      n_distinct,
      correlation
    FROM pg_stats 
    WHERE schemaname = 'public'
      AND n_distinct > 100
      AND correlation < 0.1
    ORDER BY n_distinct DESC
  `
};

export const INDEX_OPTIMIZATION_QUERIES = {
  // Rebuild fragmented indexes
  rebuildIndex: (indexName: string) => `REINDEX INDEX ${indexName};`,

  // Analyze table statistics
  analyzeTable: (tableName: string) => `ANALYZE ${tableName};`,

  // Vacuum table
  vacuumTable: (tableName: string) => `VACUUM ANALYZE ${tableName};`,

  // Drop unused index (use with caution)
  dropUnusedIndex: (indexName: string) => `DROP INDEX IF EXISTS ${indexName};`,

  // Create partial index for common queries
  createPartialIndex: (tableName: string, columns: string, condition: string) => 
    `CREATE INDEX CONCURRENTLY idx_${tableName}_partial ON ${tableName}(${columns}) WHERE ${condition};`
};

export async function runIndexMonitoring(databaseUrl: string, serviceName: string) {
  console.log(`Running index monitoring for ${serviceName} service...`);
  
  try {
    // This would be implemented with actual database connection
    // For now, we'll just log the queries that should be run
    console.log('Index Usage Query:');
    console.log(INDEX_MONITORING_QUERIES.getIndexUsage);
    
    console.log('\nUnused Indexes Query:');
    console.log(INDEX_MONITORING_QUERIES.getUnusedIndexes);
    
    console.log('\nSlow Queries Query:');
    console.log(INDEX_MONITORING_QUERIES.getSlowQueries);
    
    console.log('\nTable Size Stats Query:');
    console.log(INDEX_MONITORING_QUERIES.getTableSizeStats);
    
  } catch (error) {
    console.error(`Error monitoring ${serviceName} database:`, error);
  }
}

export function generateIndexReport(serviceName: string, stats: any) {
  const report = {
    service: serviceName,
    timestamp: new Date().toISOString(),
    recommendations: [] as string[],
    unusedIndexes: stats.unusedIndexes || [],
    slowQueries: stats.slowQueries || [],
    tableStats: stats.tableStats || []
  };

  // Generate recommendations based on stats
  if (stats.unusedIndexes && stats.unusedIndexes.length > 0) {
    report.recommendations.push(`Found ${stats.unusedIndexes.length} unused indexes that could be dropped`);
  }

  if (stats.slowQueries && stats.slowQueries.length > 0) {
    report.recommendations.push(`Found ${stats.slowQueries.length} slow queries that need optimization`);
  }

  return report;
}
