# Loaded automatically by gunicorn from the project folder. The AI call can take ~30 s, so run several threads in
# the one worker (the site stays responsive meanwhile) and allow requests up to 60 s.
threads = 8
timeout = 60
