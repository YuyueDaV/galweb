// Additive, rerunnable initial migration. No existing forum data is dropped.
export const schema = [
`CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL, email_key VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 username VARCHAR(64) NULL, username_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL, UNIQUE KEY users_username_key_unique(username_key),
 nickname VARCHAR(64) NOT NULL, signature VARCHAR(120) NOT NULL DEFAULT '', avatar_asset_id CHAR(36) NULL,
 password_hash VARCHAR(255) NOT NULL, role ENUM('member','admin','super_admin') NOT NULL DEFAULT 'member',
 status ENUM('active','disabled','deleted') NOT NULL DEFAULT 'active', deleted_at BIGINT NULL, email_verified_at BIGINT NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS auth_email_locks (email_key VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY) ENGINE=InnoDB`,
`CREATE TABLE IF NOT EXISTS email_verification_challenges (
 id CHAR(36) PRIMARY KEY, email_key VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, purpose ENUM('registration','reset') NOT NULL,
 code_hmac CHAR(64) NOT NULL, expires_at BIGINT NOT NULL, failed_attempts INT NOT NULL DEFAULT 0, consumed_at BIGINT NULL,
 delivery_status ENUM('pending','sent','failed') NOT NULL, created_at BIGINT NOT NULL,
 INDEX challenge_email(email_key,purpose,created_at), INDEX challenge_expiry(expires_at)
) ENGINE=InnoDB`,
`CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL, csrf_hash CHAR(64) NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX session_user(user_id), INDEX session_expiry(expires_at)
) ENGINE=InnoDB`,
`CREATE TABLE IF NOT EXISTS auth_rate_limits (
 bucket_key CHAR(64) PRIMARY KEY, hits INT NOT NULL, expires_at BIGINT NOT NULL, INDEX rate_expiry(expires_at)
) ENGINE=InnoDB`
]
schema.push(
`CREATE TABLE IF NOT EXISTS system_locks (id VARCHAR(64) PRIMARY KEY) ENGINE=InnoDB`,
`CREATE TABLE IF NOT EXISTS audit_logs (id CHAR(36) PRIMARY KEY, actor_id CHAR(36) NOT NULL, actor VARCHAR(64) NOT NULL, campaign_id VARCHAR(64) NULL, action VARCHAR(255) NOT NULL, created_at BIGINT NOT NULL, INDEX audit_campaign(campaign_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
)
schema.push(
`CREATE TABLE IF NOT EXISTS forum_posts (id VARCHAR(64) PRIMARY KEY, user_id CHAR(36) NULL, title VARCHAR(80) NOT NULL, category VARCHAR(32) NOT NULL, data JSON NOT NULL, status ENUM('published','hidden','deleted') NOT NULL DEFAULT 'published', created_at BIGINT NOT NULL, INDEX posts_order(status,created_at), INDEX posts_category(category,status,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS forum_post_metrics (post_id VARCHAR(64) PRIMARY KEY, views BIGINT UNSIGNED NOT NULL DEFAULT 0, FOREIGN KEY(post_id) REFERENCES forum_posts(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS forum_view_receipts (post_id VARCHAR(64) NOT NULL, viewer_key CHAR(64) NOT NULL, expires_at BIGINT NOT NULL, PRIMARY KEY(post_id,viewer_key), FOREIGN KEY(post_id) REFERENCES forum_posts(id), INDEX view_expiry(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS forum_replies (id CHAR(36) PRIMARY KEY, post_id VARCHAR(64) NOT NULL, user_id CHAR(36) NOT NULL, content TEXT NOT NULL, status ENUM('published','hidden','deleted') NOT NULL DEFAULT 'published', created_at BIGINT NOT NULL, FOREIGN KEY(post_id) REFERENCES forum_posts(id), FOREIGN KEY(user_id) REFERENCES users(id), INDEX replies_post(post_id,status,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS forum_reactions (post_id VARCHAR(64) NOT NULL, user_id CHAR(36) NOT NULL, kind ENUM('like','bookmark') NOT NULL, PRIMARY KEY(post_id,user_id,kind), FOREIGN KEY(post_id) REFERENCES forum_posts(id), FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`,
`CREATE TABLE IF NOT EXISTS works (id INT PRIMARY KEY, data JSON NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
)
schema.push(
`CREATE TABLE IF NOT EXISTS award_campaigns (id VARCHAR(64) PRIMARY KEY, edition INT NOT NULL UNIQUE, data JSON NOT NULL, version INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS award_candidates (id CHAR(36) PRIMARY KEY, campaign_id VARCHAR(64) NOT NULL, normalized_title VARCHAR(255) NOT NULL, data JSON NOT NULL, UNIQUE KEY candidate_title(campaign_id,normalized_title), FOREIGN KEY(campaign_id) REFERENCES award_campaigns(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS award_nominations (id CHAR(36) PRIMARY KEY, campaign_id VARCHAR(64) NOT NULL, candidate_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, status ENUM('pending','approved','rejected','withdrawn') NOT NULL, data JSON NOT NULL, FOREIGN KEY(campaign_id) REFERENCES award_campaigns(id), FOREIGN KEY(candidate_id) REFERENCES award_candidates(id), FOREIGN KEY(user_id) REFERENCES users(id), INDEX nomination_user(campaign_id,user_id,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS award_ballots (id CHAR(36) PRIMARY KEY, campaign_id VARCHAR(64) NOT NULL, user_id CHAR(36) NOT NULL, data JSON NOT NULL, version INT NOT NULL DEFAULT 1, UNIQUE KEY ballot_user(campaign_id,user_id), FOREIGN KEY(campaign_id) REFERENCES award_campaigns(id), FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`,
`CREATE TABLE IF NOT EXISTS award_results (campaign_id VARCHAR(64) PRIMARY KEY, data JSON NOT NULL, FOREIGN KEY(campaign_id) REFERENCES award_campaigns(id)) ENGINE=InnoDB`
)
schema.push(`CREATE TABLE IF NOT EXISTS assets (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,width INT NOT NULL,height INT NOT NULL,bytes INT NOT NULL,status ENUM('active','hidden') NOT NULL DEFAULT 'active',created_at BIGINT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`)
schema.push(
`CREATE TABLE IF NOT EXISTS forum_drafts (user_id CHAR(36) PRIMARY KEY,data JSON NOT NULL,updated_at BIGINT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS forum_reply_context (reply_id CHAR(36) PRIMARY KEY,parent_id CHAR(36) NOT NULL,FOREIGN KEY(reply_id) REFERENCES forum_replies(id),FOREIGN KEY(parent_id) REFERENCES forum_replies(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS notifications (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,kind VARCHAR(24) NOT NULL,title VARCHAR(160) NOT NULL,link VARCHAR(200) NOT NULL,post_id VARCHAR(64) NULL,reply_id CHAR(36) NULL,read_at BIGINT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),INDEX inbox(user_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS site_settings (id INT PRIMARY KEY,data JSON NOT NULL,version INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS community_entries (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,data JSON NOT NULL,status ENUM('published','hidden') NOT NULL DEFAULT 'published',created_at BIGINT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),INDEX entry_order(status,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
`CREATE TABLE IF NOT EXISTS user_library (user_id CHAR(36) NOT NULL,work_id INT NOT NULL,state ENUM('wish','reading','finished') NOT NULL,note VARCHAR(500) NOT NULL DEFAULT '',is_public BOOLEAN NOT NULL DEFAULT FALSE,updated_at BIGINT NOT NULL,PRIMARY KEY(user_id,work_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(work_id) REFERENCES works(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
)
