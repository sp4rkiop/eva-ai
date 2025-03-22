
CREATE KEYSPACE IF NOT EXISTS chatdb
WITH replication = {
	'class' : 'SimpleStrategy',
	'replication_factor' : 1
};

CREATE TABLE IF NOT EXISTS chatdb.chathistory (
	userid uuid,
	chatid uuid,
	chathistoryjson blob,
	chattitle text,
	createdon timestamp,
	nettokenconsumption int,
	PRIMARY KEY (userid, chatid)
);

CREATE TABLE IF NOT EXISTS chatdb.availablemodels (
	deploymentid uuid,
	apikey text,
	deploymentname text,
	endpoint text,
	isactive boolean,
	modelname text,
	modeltype text,
	modelversion text,
	provider text,
	PRIMARY KEY (deploymentid)
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

