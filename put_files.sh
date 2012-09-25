ls -1 *.js | xargs -I __file__ curl -X PUT -H "Content-Type: application/javascript" --data-binary @__file__ http://127.0.0.1:8098/riak/static/__file__
ls -1 *.html | xargs -I __file__ curl -X PUT -H "Content-Type: text/html"  --data-binary @__file__ http://127.0.0.1:8098/riak/static/__file__
