
CREATE KEYSPACE IF NOT EXISTS eva
WITH replication = {
	'class' : 'SimpleStrategy',
	'replication_factor' : 1
};

CREATE TABLE IF NOT EXISTS eva.chathistory (
	userid uuid,
	chatid uuid,
	visible boolean,
	chathistoryjson blob,
	chattitle text,
	createdon timestamp,
	nettokenconsumption int,
	PRIMARY KEY (userid, chatid)
);
CREATE MATERIALIZED VIEW IF NOT EXISTS eva.chathistory_by_visible AS
SELECT userid, chatid, chathistoryjson, chattitle, createdon, nettokenconsumption
FROM eva.chathistory
WHERE visible IS NOT NULL AND userid IS NOT NULL AND chatid IS NOT NULL
PRIMARY KEY (visible, userid, chatid);

CREATE TABLE IF NOT EXISTS eva.availablemodels (
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

CREATE TABLE IF NOT EXISTS eva.usersubscriptions (
	userid uuid,
	modelid uuid,
	PRIMARY KEY (userid, modelid)
);

CREATE TABLE IF NOT EXISTS eva.users (
	email text,
	partner text,
	userid uuid,
	firstname text,
	lastname text,
	role text,
	PRIMARY KEY (( email, partner ), userid)
);

