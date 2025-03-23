
CREATE KEYSPACE IF NOT EXISTS chatdb
WITH replication = {
	'class' : 'SimpleStrategy',
	'replication_factor' : 1
};

CREATE TABLE IF NOT EXISTS chatdb.chathistory (
	userid uuid,
	chatid uuid,
	visible boolean,
	chathistoryjson blob,
	chattitle text,
	createdon timestamp,
	nettokenconsumption int,
	PRIMARY KEY (userid, chatid)
);
CREATE MATERIALIZED VIEW IF NOT EXISTS chatdb.chathistory_by_visible AS
SELECT userid, chatid, chathistoryjson, chattitle, createdon, nettokenconsumption
FROM chatdb.chathistory
WHERE visible IS NOT NULL AND userid IS NOT NULL AND chatid IS NOT NULL
PRIMARY KEY (visible, userid, chatid);

CREATE TABLE IF NOT EXISTS chatdb.availablemodels (
    deploymentid uuid,
    isactive boolean,
    apikey text,
    deploymentname text,
    endpoint text,
    modelname text,
    modeltype text,
    modelversion text,
    provider text,
    PRIMARY KEY ((deploymentid), isactive)
);

CREATE TABLE IF NOT EXISTS chatdb.usersubscriptions (
	userid uuid,
	modelid uuid,
	PRIMARY KEY (userid, modelid)
);

CREATE TABLE IF NOT EXISTS chatdb.users (
	email text,
	partner text,
	userid uuid,
	firstname text,
	lastname text,
	role text,
	PRIMARY KEY (( email, partner ), userid)
);

